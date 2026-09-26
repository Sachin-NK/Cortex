from __future__ import annotations
"""
Workflow Engine - executes multi-step AI pipelines with:
  - Sequential and parallel steps
  - Conditional branching
  - Retry loops with exponential backoff
  - Failure branches / escalation
  - Human approval gates
  - SQLite-backed checkpointing and resumption
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Any, Callable, Awaitable
import uuid
import asyncio
import json
import logging
import sqlite3
import time
import os

from ..providers.base import LLMRequest

logger = logging.getLogger(__name__)

# SQLite DB path - configurable via env var
_DB_PATH = os.getenv("CORTEX_STATE_DB", "/tmp/cortex_state.db")


# -- Data models ---------------------------------------------------------------

class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    AWAITING_APPROVAL = "awaiting_approval"


@dataclass
class WorkflowStep:
    id: str
    name: str
    role: str                           # e.g. "architect", "developer", "reviewer"
    prompt_template: str                # Use {input} and {context} placeholders
    provider_hint: Optional[str] = None  # Preferred provider for this step
    model_hint: Optional[str] = None
    requires_approval: bool = False
    depends_on: list[str] = field(default_factory=list)   # Step IDs (sequential dep)
    parallel_group: Optional[str] = None  # Steps with same group run in parallel
    max_tokens: int = 2048
    temperature: float = 0.7
    max_retries: int = 2                # retry attempts on failure
    # Condition: python expression evaluated with {"context": run.context} - skip if False
    condition: Optional[str] = None
    # Escalation target step id - run this step if current step fails after all retries
    on_failure_step: Optional[str] = None
    # Optional transform: takes (context_str, run_context) → list[dict] messages
    input_transform: Optional[Callable[[str, dict], list[dict]]] = None


@dataclass
class StepResult:
    step_id: str
    status: StepStatus
    output: str = ""
    provider: str = ""
    model: str = ""
    tokens: int = 0
    cost_usd: float = 0.0
    error: Optional[str] = None
    attempts: int = 0


@dataclass
class WorkflowDefinition:
    id: str
    name: str
    description: str
    steps: list[WorkflowStep]
    tags: list[str] = field(default_factory=list)


@dataclass
class WorkflowRun:
    id: str
    workflow_id: str
    status: StepStatus = StepStatus.PENDING
    results: dict[str, StepResult] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    total_cost_usd: float = 0.0
    total_tokens: int = 0
    approval_queue: list[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def failed_steps(self) -> list[str]:
        """Return a list of step IDs that ended in a FAILED status."""
        return [sid for sid, r in self.results.items() if r.status == StepStatus.FAILED]

    def is_complete(self) -> bool:
        """Return True when the run is no longer in PENDING or RUNNING state."""
        return self.status not in (StepStatus.PENDING, StepStatus.RUNNING)


# -- SQLite checkpoint store ---------------------------------------------------

class CheckpointStore:
    """Persist workflow runs to SQLite so they can be resumed after restart."""

    def __init__(self, db_path: str = _DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS workflow_runs (
                        run_id      TEXT PRIMARY KEY,
                        workflow_id TEXT NOT NULL,
                        status      TEXT NOT NULL,
                        data        TEXT NOT NULL,
                        created_at  REAL NOT NULL,
                        updated_at  REAL NOT NULL
                    )
                """)
                conn.commit()
        except Exception as e:
            logger.warning(f"CheckpointStore init failed (in-memory only): {e}")

    def save(self, run: WorkflowRun) -> None:
        try:
            data = {
                "results": {
                    sid: {
                        "step_id": r.step_id,
                        "status": r.status.value,
                        "output": r.output,
                        "provider": r.provider,
                        "model": r.model,
                        "tokens": r.tokens,
                        "cost_usd": r.cost_usd,
                        "error": r.error,
                        "attempts": r.attempts,
                    }
                    for sid, r in run.results.items()
                },
                "context": {k: v for k, v in run.context.items() if k != "steps"},
                "total_cost_usd": run.total_cost_usd,
                "total_tokens": run.total_tokens,
                "approval_queue": run.approval_queue,
            }
            run.updated_at = time.time()
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """INSERT OR REPLACE INTO workflow_runs
                       (run_id, workflow_id, status, data, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (run.id, run.workflow_id, run.status.value,
                     json.dumps(data), run.created_at, run.updated_at),
                )
                conn.commit()
        except Exception as e:
            logger.warning(f"Checkpoint save failed: {e}")

    def load(self, run_id: str) -> Optional[dict]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                row = conn.execute(
                    "SELECT workflow_id, status, data, created_at, updated_at FROM workflow_runs WHERE run_id=?",
                    (run_id,),
                ).fetchone()
            if not row:
                return None
            return {
                "run_id": run_id,
                "workflow_id": row[0],
                "status": row[1],
                "data": json.loads(row[2]),
                "created_at": row[3],
                "updated_at": row[4],
            }
        except Exception as e:
            logger.warning(f"Checkpoint load failed: {e}")
            return None

    def list_runs(self) -> list[dict]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(
                    "SELECT run_id, workflow_id, status, updated_at FROM workflow_runs ORDER BY updated_at DESC LIMIT 100"
                ).fetchall()
            return [{"run_id": r[0], "workflow_id": r[1], "status": r[2], "updated_at": r[3]} for r in rows]
        except Exception:
            return []

    def delete(self, run_id: str) -> bool:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM workflow_runs WHERE run_id=?", (run_id,))
                conn.commit()
            return True
        except Exception:
            return False


# -- Workflow Engine -----------------------------------------------------------

class WorkflowEngine:
    def __init__(self, router, checkpoint_store: Optional[CheckpointStore] = None):
        self.router = router
        self._runs: dict[str, WorkflowRun] = {}
        self._approval_callbacks: dict[str, asyncio.Event] = {}
        self._checkpoints = checkpoint_store or CheckpointStore()

    # -- Run lifecycle ---------------------------------------------------------

    def create_run(self, workflow: WorkflowDefinition, initial_input: str) -> WorkflowRun:
        run = WorkflowRun(
            id=str(uuid.uuid4()),
            workflow_id=workflow.id,
            context={"input": initial_input, "steps": {}},
        )
        self._runs[run.id] = run
        return run

    def get_run(self, run_id: str) -> Optional[WorkflowRun]:
        # Check in-memory first, then checkpoint store
        if run_id in self._runs:
            return self._runs[run_id]
        ckpt = self._checkpoints.load(run_id)
        if ckpt:
            return self._restore_run(ckpt)
        return None

    def list_runs(self) -> list[WorkflowRun]:
        return list(self._runs.values())

    def _restore_run(self, ckpt: dict) -> WorkflowRun:
        """Reconstruct a WorkflowRun from a checkpoint dict."""
        data = ckpt["data"]
        run = WorkflowRun(
            id=ckpt["run_id"],
            workflow_id=ckpt["workflow_id"],
            status=StepStatus(ckpt["status"]),
            total_cost_usd=data.get("total_cost_usd", 0.0),
            total_tokens=data.get("total_tokens", 0),
            approval_queue=data.get("approval_queue", []),
            context=data.get("context", {}),
            created_at=ckpt["created_at"],
            updated_at=ckpt["updated_at"],
        )
        for sid, rd in data.get("results", {}).items():
            run.results[sid] = StepResult(
                step_id=rd["step_id"],
                status=StepStatus(rd["status"]),
                output=rd.get("output", ""),
                provider=rd.get("provider", ""),
                model=rd.get("model", ""),
                tokens=rd.get("tokens", 0),
                cost_usd=rd.get("cost_usd", 0.0),
                error=rd.get("error"),
                attempts=rd.get("attempts", 0),
            )
        self._runs[run.id] = run
        return run

    # -- Approval --------------------------------------------------------------

    async def approve_step(self, run_id: str, step_id: str) -> None:
        key = f"{run_id}:{step_id}"
        event = self._approval_callbacks.get(key)
        if event:
            event.set()

    # -- Execution -------------------------------------------------------------

    async def execute(
        self,
        workflow: WorkflowDefinition,
        initial_input: str,
        policy,
        on_step_complete: Optional[Callable[[StepResult], Awaitable[None]]] = None,
        resume_run_id: Optional[str] = None,
    ) -> WorkflowRun:
        """Execute a workflow. Pass resume_run_id to continue a checkpointed run."""

        if resume_run_id:
            run = self.get_run(resume_run_id)
            if not run:
                raise ValueError(f"Run '{resume_run_id}' not found for resumption")
            logger.info(f"Resuming run {run.id} at checkpoint")
        else:
            run = self.create_run(workflow, initial_input)

        run.status = StepStatus.RUNNING
        self._checkpoints.save(run)

        # Group steps by parallel_group; ungrouped run sequentially
        # Build execution plan: list of "batches" where each batch is a list of steps
        execution_plan = self._build_execution_plan(workflow.steps)

        for batch in execution_plan:
            if len(batch) == 1:
                await self._execute_step(batch[0], run, initial_input, policy, on_step_complete, workflow)
            else:
                # Parallel batch
                await asyncio.gather(*[
                    self._execute_step(step, run, initial_input, policy, on_step_complete, workflow)
                    for step in batch
                ])
            self._checkpoints.save(run)

        run.status = StepStatus.COMPLETED
        self._checkpoints.save(run)
        return run

    def _build_execution_plan(self, steps: list[WorkflowStep]) -> list[list[WorkflowStep]]:
        """Convert a flat step list into ordered batches (sequential or parallel groups)."""
        plan: list[list[WorkflowStep]] = []
        seen_groups: dict[str, list[WorkflowStep]] = {}

        for step in steps:
            if step.parallel_group:
                if step.parallel_group not in seen_groups:
                    seen_groups[step.parallel_group] = []
                    plan.append(seen_groups[step.parallel_group])
                seen_groups[step.parallel_group].append(step)
            else:
                plan.append([step])

        return plan

    async def _execute_step(
        self,
        step: WorkflowStep,
        run: WorkflowRun,
        initial_input: str,
        policy,
        on_step_complete: Optional[Callable],
        workflow: WorkflowDefinition,
    ) -> None:
        # Skip already-completed steps (resumption)
        existing = run.results.get(step.id)
        if existing and existing.status == StepStatus.COMPLETED:
            logger.info(f"Step {step.id} already completed - skipping (resumed run)")
            return

        # Wait for dependencies — use asyncio.Event instead of busy-wait
        if step.depends_on:
            deadline = asyncio.get_event_loop().time() + 120
            while True:
                if all(
                    run.results.get(d) and run.results[d].status == StepStatus.COMPLETED
                    for d in step.depends_on
                ):
                    break
                if asyncio.get_event_loop().time() >= deadline:
                    run.results[step.id] = StepResult(
                        step_id=step.id, status=StepStatus.SKIPPED,
                        error=f"Dependencies not met after 120s: {step.depends_on}"
                    )
                    return
                await asyncio.sleep(0.5)

        # Evaluate condition safely (no arbitrary code execution via eval)
        if step.condition:
            try:
                should_run = self._eval_condition(step.condition, run)
            except Exception as e:
                logger.warning(f"Step {step.id} condition error: {e} - running anyway")
                should_run = True
            if not should_run:
                run.results[step.id] = StepResult(step_id=step.id, status=StepStatus.SKIPPED,
                                                   error="Condition evaluated to False")
                logger.info(f"Step {step.id} skipped (condition false)")
                return

        # Approval gate
        if step.requires_approval:
            run.results[step.id] = StepResult(step_id=step.id, status=StepStatus.AWAITING_APPROVAL)
            if step.id not in run.approval_queue:
                run.approval_queue.append(step.id)
            self._checkpoints.save(run)
            key = f"{run.id}:{step.id}"
            event = asyncio.Event()
            self._approval_callbacks[key] = event
            logger.info(f"Step {step.id} awaiting approval")
            await event.wait()
            if step.id in run.approval_queue:
                run.approval_queue.remove(step.id)

        # Execute with retries and per-step timeout
        run.results[step.id] = StepResult(step_id=step.id, status=StepStatus.RUNNING)
        last_error: Optional[str] = None
        step_timeout = getattr(step, 'timeout_seconds', 120)

        for attempt in range(step.max_retries + 1):
            try:
                result = await asyncio.wait_for(
                    self._call_llm(step, run, initial_input, policy),
                    timeout=step_timeout,
                )
                result.attempts = attempt + 1
                run.results[step.id] = result
                run.total_cost_usd += result.cost_usd
                run.total_tokens += result.tokens
                run.context["steps"][step.id] = result.output
                if on_step_complete:
                    await on_step_complete(result)
                return

            except (Exception, asyncio.TimeoutError) as e:
                last_error = f"Timeout after {step_timeout}s" if isinstance(e, asyncio.TimeoutError) else str(e)
                logger.warning(f"Step {step.id} attempt {attempt+1} failed: {e}")
                if attempt < step.max_retries:
                    delay = 1.0 * (2 ** attempt)
                    logger.info(f"Retrying step {step.id} in {delay}s")
                    await asyncio.sleep(delay)

        # All retries exhausted
        fail_result = StepResult(
            step_id=step.id, status=StepStatus.FAILED,
            error=last_error, attempts=step.max_retries + 1,
        )
        run.results[step.id] = fail_result
        logger.error(f"Step {step.id} failed after {step.max_retries+1} attempts: {last_error}")

        # Execute failure branch if configured
        if step.on_failure_step:
            escalation = next((s for s in workflow.steps if s.id == step.on_failure_step), None)
            if escalation:
                logger.info(f"Executing failure branch step '{step.on_failure_step}'")
                await self._execute_step(escalation, run, initial_input, policy, on_step_complete, workflow)

        if on_step_complete:
            await on_step_complete(fail_result)

    async def _call_llm(
        self,
        step: WorkflowStep,
        run: WorkflowRun,
        initial_input: str,
        policy,
    ) -> StepResult:
        """Build messages and execute the LLM call for a step."""
        completed_outputs = {
            sid: r.output
            for sid, r in run.results.items()
            if r.status == StepStatus.COMPLETED and r.output
        }

        if completed_outputs:
            prior = "\n\n".join(
                f"--- {sid.upper()} OUTPUT ---\n{out}"
                for sid, out in completed_outputs.items()
            )
            context_block = f"ORIGINAL TASK:\n{initial_input}\n\nPRIOR STEPS:\n{prior}"
        else:
            context_block = initial_input

        if step.input_transform:
            messages = step.input_transform(context_block, run.context)
        else:
            prompt = step.prompt_template.format(
                input=initial_input,
                context=context_block,
            )
            messages = [
                {
                    "role": "system",
                    "content": (
                        f"You are a {step.role}. Be concise and thorough.\n"
                        f"Original task: {initial_input}"
                    ),
                },
                {"role": "user", "content": prompt},
            ]

        # Override policy if step has a provider hint
        step_policy = policy
        if step.provider_hint:
            from .policies import Policy, PolicyType
            step_policy = Policy(
                type=PolicyType.CUSTOM,
                name="step-override",
                description="",
                preferred_providers=[step.provider_hint],
            )

        req = LLMRequest(
            messages=messages,
            model=step.model_hint,
            max_tokens=step.max_tokens,
            temperature=step.temperature,
        )
        response, _decision = await self.router.execute_with_fallback(req, step_policy)

        return StepResult(
            step_id=step.id,
            status=StepStatus.COMPLETED,
            output=response.content,
            provider=response.provider,
            model=response.model,
            tokens=response.input_tokens + response.output_tokens,
            cost_usd=response.cost_usd,
        )

    def _eval_condition(self, condition: str, run: "WorkflowRun") -> bool:
        """
        Safe condition evaluation supporting simple expressions only.
        Supports: step_completed(id), step_failed(id), context_has(key), True, False.
        No arbitrary code execution.
        """
        cond = condition.strip()
        # Simple boolean literals
        if cond in ("True", "true", "1"):
            return True
        if cond in ("False", "false", "0"):
            return False
        # step_completed("step_id")
        import re as _re
        m = _re.match(r'^step_completed\(["\'](.+)["\']\)$', cond)
        if m:
            sid = m.group(1)
            r = run.results.get(sid)
            return r is not None and r.status == StepStatus.COMPLETED
        # step_failed("step_id")
        m = _re.match(r'^step_failed\(["\'](.+)["\']\)$', cond)
        if m:
            sid = m.group(1)
            r = run.results.get(sid)
            return r is not None and r.status == StepStatus.FAILED
        # context_has("key")
        m = _re.match(r'^context_has\(["\'](.+)["\']\)$', cond)
        if m:
            return m.group(1) in run.context
        # Fallback: log and allow
        logger.warning(f"Unrecognised condition expression '{cond}' — treating as True")
        return True

    def serialize_run(self, run: WorkflowRun) -> dict:
        return {
            "run_id": run.id,
            "workflow_id": run.workflow_id,
            "status": run.status.value if hasattr(run.status, "value") else str(run.status),
            "total_cost_usd": round(run.total_cost_usd, 6),
            "total_tokens": run.total_tokens,
            "approval_queue": run.approval_queue,
            "steps": {
                sid: {
                    "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                    "provider": r.provider,
                    "model": r.model,
                    "tokens": r.tokens,
                    "cost_usd": r.cost_usd,
                    "error": r.error,
                    "attempts": r.attempts,
                    "output": r.output or None,
                }
                for sid, r in run.results.items()
            },
        }
