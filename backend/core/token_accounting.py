from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class UsageRecord:
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    provider: str = ""
    model: str = ""
    agent: str = ""
    workflow_id: str = ""
    task_type: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0

    @property
    def total_tokens(self) -> int:
        """Sum of input, output, and cached token counts."""
        return self.input_tokens + self.output_tokens + self.cached_tokens


@dataclass
class ClaudeBudgetPolicy:
    enabled: bool = True
    maximum_calls_per_workflow: int = 3
    maximum_input_tokens_per_call: int = 12000
    maximum_output_tokens_per_call: int = 3000
    allowed_tasks: list[str] = field(default_factory=lambda: [
        "architecture_approval",
        "conflict_resolution",
        "critical_security_review",
        "final_quality_gate",
        "final_verification",
    ])


class TokenAccountant:
    def __init__(self, claude_budget: Optional[ClaudeBudgetPolicy] = None):
        self._records: list[UsageRecord] = []
        self._claude_calls_per_workflow: dict[str, int] = {}
        self.claude_budget = claude_budget or ClaudeBudgetPolicy()

    def check_claude_allowed(self, workflow_id: str, task_type: str, input_tokens: int) -> tuple[bool, str]:
        """Returns (allowed, reason). Call before sending to Claude."""
        if not self.claude_budget.enabled:
            return True, "budget disabled"

        if task_type not in self.claude_budget.allowed_tasks:
            return False, f"task_type '{task_type}' not in Claude allowed list: {self.claude_budget.allowed_tasks}"

        calls = self._claude_calls_per_workflow.get(workflow_id, 0)
        if calls >= self.claude_budget.maximum_calls_per_workflow:
            return False, f"Claude call budget exhausted ({calls}/{self.claude_budget.maximum_calls_per_workflow}) for workflow {workflow_id}"

        if input_tokens > self.claude_budget.maximum_input_tokens_per_call:
            return False, f"Input tokens {input_tokens} exceeds Claude limit {self.claude_budget.maximum_input_tokens_per_call}"

        return True, "ok"

    def record(self, record: UsageRecord) -> None:
        self._records.append(record)
        if record.provider == "anthropic":
            wid = record.workflow_id or "_global"
            self._claude_calls_per_workflow[wid] = self._claude_calls_per_workflow.get(wid, 0) + 1

    def get_report(self, workflow_id: Optional[str] = None) -> dict:
        records = [r for r in self._records if not workflow_id or r.workflow_id == workflow_id]

        total_input = sum(r.input_tokens for r in records)
        total_output = sum(r.output_tokens for r in records)
        total_cost = sum(r.cost_usd for r in records)

        by_provider: dict[str, dict] = {}
        for r in records:
            p = by_provider.setdefault(r.provider, {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "calls": 0})
            p["input_tokens"] += r.input_tokens
            p["output_tokens"] += r.output_tokens
            p["cost_usd"] += r.cost_usd
            p["calls"] += 1

        claude_data = by_provider.get("anthropic", {})
        claude_tokens = claude_data.get("input_tokens", 0) + claude_data.get("output_tokens", 0)
        total_tokens = total_input + total_output
        claude_pct = round(claude_tokens / total_tokens * 100, 1) if total_tokens else 0.0

        by_agent: dict[str, dict] = {}
        for r in records:
            if r.agent:
                a = by_agent.setdefault(r.agent, {"tokens": 0, "cost_usd": 0.0, "calls": 0})
                a["tokens"] += r.input_tokens + r.output_tokens
                a["cost_usd"] += r.cost_usd
                a["calls"] += 1

        return {
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 6),
            "by_provider": {k: {**v, "cost_usd": round(v["cost_usd"], 6)} for k, v in by_provider.items()},
            "by_agent": by_agent,
            "by_task_type": {
                task: {"calls": sum(1 for r in records if r.task_type == task),
                       "tokens": sum(r.input_tokens + r.output_tokens for r in records if r.task_type == task),
                       "cost_usd": round(sum(r.cost_usd for r in records if r.task_type == task), 6)}
                for task in {r.task_type for r in records if r.task_type}
            },
            "claude_efficiency": {
                "calls": claude_data.get("calls", 0),
                "input_tokens": claude_data.get("input_tokens", 0),
                "output_tokens": claude_data.get("output_tokens", 0),
                "total_tokens": claude_tokens,
                "percentage_of_total": claude_pct,
                "tasks_delegated_away_from_claude": len([r for r in records if r.provider != "anthropic"]),
                "estimated_savings_usd": round(
                    # What it would have cost if ALL requests used Claude's output rate
                    # vs what it actually cost using cheaper models
                    sum(
                        (0.075 / 1000) * r.output_tokens - r.cost_usd
                        for r in records if r.provider != "anthropic"
                    ),
                    4,
                ),
            },
        }
