from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
import os
import time
import asyncio
import json
import logging
from dotenv import load_dotenv

load_dotenv()  # Load .env before reading any env vars

from .providers import PROVIDER_MAP
from .providers.base import LLMRequest
from .core.router import TaskRouter
from .core.policies import PolicyType, get_policy, BUILTIN_POLICIES
from .core.memory import MemoryStore, Message, MemoryScope
from .core.workflow import WorkflowEngine, CheckpointStore
from .core.discovery import ModelRegistry
from .core.token_accounting import TokenAccountant, ClaudeBudgetPolicy
from .core.observability import TraceStore, TraceEvent
from .core.security import SecurityEngine
from .core.validation import OutputValidator
from .core.classifier import TaskClassifier
from .agents.registry import AgentRegistry
from .mcp.orchestrator import MCPOrchestrator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Allowed origins ────────────────────────────────────────────────────────────
# In production set ALLOWED_ORIGINS env var to your Vercel URL, e.g.:
#   ALLOWED_ORIGINS=https://cortex-ide.vercel.app,https://mycortex.vercel.app
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app = FastAPI(
    title="Cortex",
    version="2.0.0",
    description="Multi-Model AI Agent Harness — provider-agnostic, Claude-efficient",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)


# ── Bootstrap ──────────────────────────────────────────────────────────────────
def _build_providers() -> dict:
    configs = {
        "openai":     ("OPENAI_API_KEY",     "gpt-4o"),
        "anthropic":  ("ANTHROPIC_API_KEY",  "claude-opus-4-5"),
        "gemini":     ("GEMINI_API_KEY",      "gemini-1.5-pro"),
        "deepseek":   ("DEEPSEEK_API_KEY",    "deepseek-chat"),
        "kimi":       ("KIMI_API_KEY",         "moonshot-v1-128k"),
        "openrouter": ("OPENROUTER_API_KEY",  "openai/gpt-4o-mini"),
    }
    providers: dict = {}
    for pid, (env_key, model) in configs.items():
        api_key = os.getenv(env_key)
        if api_key:
            providers[pid] = PROVIDER_MAP[pid](api_key=api_key, model=model)
    if os.getenv("ENABLE_MOCK_PROVIDER", "false").lower() == "true":
        from .providers.mock import MockProvider
        providers["mock"] = MockProvider()
    return providers


providers      = _build_providers()
registry       = ModelRegistry()
accountant     = TokenAccountant(ClaudeBudgetPolicy())
trace_store    = TraceStore()
security       = SecurityEngine()
router         = TaskRouter(
    providers, registry=registry, accountant=accountant,
    trace_store=trace_store, security_engine=security,
)
memory         = MemoryStore()
checkpoints    = CheckpointStore()
workflow_engine = WorkflowEngine(router, checkpoint_store=checkpoints)
agent_registry = AgentRegistry()
mcp            = MCPOrchestrator()
validator      = OutputValidator()
classifier     = TaskClassifier()

# ── Health cache ───────────────────────────────────────────────────────────────
_health_cache_ttl     = 30
_health_last_checked: float = 0.0


async def _maybe_refresh_health() -> None:
    global _health_last_checked
    now = time.monotonic()
    if now - _health_last_checked >= _health_cache_ttl:
        _health_last_checked = now
        await router.refresh_health()


@app.on_event("startup")
async def startup():
    registry.discover()
    if providers:
        asyncio.create_task(router.refresh_health())
    logger.info(f"Cortex started — providers: {list(providers.keys())}")


# ── Request schemas ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    policy: PolicyType = PolicyType.BALANCED
    stream: bool = False
    provider_override: Optional[str] = None


class RunAgentRequest(BaseModel):
    agent_id: str
    input: str
    policy: PolicyType = PolicyType.BALANCED
    workflow_id: Optional[str] = None
    resume_run_id: Optional[str] = None


class ApproveStepRequest(BaseModel):
    run_id: str
    step_id: str


class MemoryWriteRequest(BaseModel):
    key: str
    value: str
    scope: str = "workflow"
    provenance: str = ""
    is_assumption: bool = False
    ttl_seconds: Optional[int] = None


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Lightweight liveness probe — no external calls."""
    return {
        "status": "ok",
        "version": "2.0.0",
        "providers_configured": len(providers),
    }


# ── Chat ───────────────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(req: ChatRequest):
    safe_msg = security.validate_prompt(req.message)

    session = memory.get_session(req.session_id) if req.session_id else None
    if not session:
        session = memory.create_session()

    memory.add_message(session.id, Message(role="user", content=safe_msg))
    messages = memory.get_messages_for_llm(session.id)

    policy = get_policy(req.policy)
    if req.provider_override and req.provider_override in providers:
        from .core.policies import Policy, PolicyType as PT
        policy = Policy(
            type=PT.CUSTOM, name="override", description="",
            preferred_providers=[req.provider_override],
        )

    classification = classifier.classify(messages)
    trace = trace_store.create(workflow_id=session.id, user_request=safe_msg[:200])
    trace.add_event(TraceEvent(
        event_type="classification",
        workflow_id=session.id,
        message=(
            f"type={classification.task_type.value} "
            f"complexity={classification.complexity.value}"
        ),
    ))

    llm_req = LLMRequest(messages=messages, stream=req.stream)

    if req.stream:
        async def generate():
            decision = await router.route(llm_req, policy, workflow_id=session.id)
            p = providers.get(decision.provider_id)
            if not p:
                yield "data: [ERROR: no provider]\n\n"
                return
            async for chunk in p.stream(llm_req):
                yield f"data: {json.dumps({'chunk': chunk, 'provider': decision.provider_id})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(generate(), media_type="text/event-stream")

    response, decision = await router.execute_with_fallback(
        llm_req, policy, workflow_id=session.id, agent="chat", trace=trace,
    )

    v_result  = validator.validate_not_empty(response.content)
    v_secrets = validator.validate_no_secrets(response.content)

    memory.add_message(session.id, Message(
        role="assistant", content=response.content,
        provider=response.provider, model=response.model,
        tokens=response.input_tokens + response.output_tokens,
        cost_usd=response.cost_usd,
    ))
    trace.complete()

    return {
        "session_id": session.id,
        "trace_id": trace.trace_id,
        "response": response.content,
        "classification": {
            "task_type": classification.task_type.value,
            "complexity": classification.complexity.value,
            "requires_code": classification.requires_code,
            "requires_vision": classification.requires_vision,
        },
        "routing": {
            "provider": decision.provider_id,
            "model": decision.model,
            "reason": decision.reason,
            "fallback_chain": decision.fallback_chain,
        },
        "usage": {
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "cost_usd": response.cost_usd,
            "latency_ms": response.latency_ms,
        },
        "validation": {
            "output_valid": v_result.valid,
            "no_secrets": v_secrets.valid,
        },
        "session_stats": memory.get_stats(session.id),
    }


# ── Agents ─────────────────────────────────────────────────────────────────────

@app.get("/agents")
async def list_agents(tag: Optional[str] = None):
    return [
        {
            "id": a.id, "name": a.name,
            "description": a.description,
            "tags": a.tags,
            "steps": len(a.steps),
        }
        for a in agent_registry.list_agents(tag=tag)
    ]


@app.post("/agents/run")
async def run_agent(req: RunAgentRequest, background_tasks: BackgroundTasks):
    agent = agent_registry.get_agent(req.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{req.agent_id}' not found")

    policy = get_policy(req.policy)

    # Support resumption
    if req.resume_run_id:
        existing = workflow_engine.get_run(req.resume_run_id)
        if not existing:
            raise HTTPException(status_code=404, detail=f"Run '{req.resume_run_id}' not found")
        run = existing
    else:
        run = workflow_engine.create_run(agent, req.input)

    trace = trace_store.create(workflow_id=run.id, user_request=req.input[:200])

    async def execute():
        try:
            await workflow_engine.execute(
                agent, req.input, policy,
                resume_run_id=run.id,
            )
            trace.complete()
        except Exception as e:
            logger.error(f"Agent run {run.id} failed: {e}")
            trace.complete(status="failed")

    background_tasks.add_task(execute)
    return {
        "run_id": run.id,
        "trace_id": trace.trace_id,
        "status": "started",
        "agent": req.agent_id,
        "resumed": req.resume_run_id is not None,
    }


@app.get("/agents/runs")
async def list_runs():
    runs = workflow_engine.list_runs()
    return [workflow_engine.serialize_run(r) for r in runs]


@app.get("/agents/runs/history")
async def list_run_history():
    """All persisted runs from SQLite."""
    return checkpoints.list_runs()


@app.get("/agents/runs/{run_id}")
async def get_run_status(run_id: str):
    run = workflow_engine.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return workflow_engine.serialize_run(run)


@app.post("/agents/runs/approve")
async def approve_step(req: ApproveStepRequest):
    await workflow_engine.approve_step(req.run_id, req.step_id)
    return {"approved": True}


@app.get("/agents/runs/{run_id}/output")
async def get_run_output(run_id: str):
    run = workflow_engine.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    outputs = {sid: r.output for sid, r in run.results.items() if r.output}
    final = list(outputs.values())[-1] if outputs else ""
    return {"run_id": run_id, "final_output": final, "step_outputs": outputs}


# ── Providers & Models ─────────────────────────────────────────────────────────

@app.get("/providers")
async def list_providers():
    await _maybe_refresh_health()
    result = []
    for pid, p in providers.items():
        meta = p.meta
        result.append({
            "id": meta.id, "name": meta.name, "models": meta.models,
            "status": router._health_cache.get(pid, "unknown"),
            "cost_per_1k_input": meta.cost_per_1k_input,
            "cost_per_1k_output": meta.cost_per_1k_output,
            "avg_latency_ms": meta.avg_latency_ms,
            "capabilities": {
                "vision": meta.capabilities.vision,
                "function_calling": meta.capabilities.function_calling,
                "long_context": meta.capabilities.long_context,
                "code": meta.capabilities.code,
                "reasoning": meta.capabilities.reasoning,
                "max_context_tokens": meta.capabilities.max_context_tokens,
            },
        })
    return result


@app.get("/models")
async def list_models():
    return registry.list_all()


@app.get("/policies")
async def list_policies():
    return [
        {
            "type": p.type, "name": p.name,
            "description": p.description,
            "preferred_providers": p.preferred_providers,
        }
        for p in BUILTIN_POLICIES.values()
    ]


# ── Costs & Accounting ─────────────────────────────────────────────────────────

@app.get("/costs")
async def costs_report(workflow_id: Optional[str] = None):
    return accountant.get_report(workflow_id)


# ── Traces ─────────────────────────────────────────────────────────────────────

@app.get("/traces")
async def list_traces():
    return trace_store.list()


@app.get("/traces/{trace_id}")
async def get_trace(trace_id: str):
    trace = trace_store.get(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace.to_dict()


# ── MCP Tools ──────────────────────────────────────────────────────────────────

@app.get("/mcp/tools")
async def list_mcp_tools():
    return [
        {"id": t.id, "name": t.name, "description": t.description}
        for t in mcp.list_tools()
    ]


@app.post("/mcp/invoke/{tool_id}")
async def invoke_mcp_tool(tool_id: str, args: dict = {}):
    allowed, reason = security.check_tool_allowed(tool_id)
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)
    result = await mcp.invoke(tool_id, **args)
    return {
        "tool_id": result.tool_id,
        "success": result.success,
        "output": result.output,
        "error": result.error,
    }


# ── Sessions ───────────────────────────────────────────────────────────────────

@app.get("/sessions")
async def list_sessions():
    return [
        {"id": s.id, "created_at": s.created_at, **memory.get_stats(s.id)}
        for s in memory.list_sessions()
    ]


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    if not memory.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


# ── Memory ─────────────────────────────────────────────────────────────────────

@app.post("/memory")
async def write_memory(req: MemoryWriteRequest):
    try:
        scope = MemoryScope(req.scope)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scope '{req.scope}'")
    entry = memory.remember(
        key=req.key, value=req.value, scope=scope,
        provenance=req.provenance, is_assumption=req.is_assumption,
        ttl_seconds=req.ttl_seconds,
    )
    return {"id": entry.id, "key": entry.key, "scope": entry.scope}


@app.get("/memory/{scope}")
async def read_memory(scope: str):
    try:
        ms = MemoryScope(scope)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scope '{scope}'")
    return [
        {
            "id": e.id, "key": e.key, "value": e.value,
            "provenance": e.provenance, "is_assumption": e.is_assumption,
            "created_at": e.created_at,
        }
        for e in memory.list_entries(ms)
    ]


@app.delete("/memory/{entry_id}")
async def delete_memory_entry(entry_id: str):
    if not memory.delete_entry(entry_id):
        raise HTTPException(status_code=404, detail="Memory entry not found")
    return {"deleted": True}


# ── Security ───────────────────────────────────────────────────────────────────

@app.get("/security")
async def security_summary():
    return security.get_privacy_summary()


@app.get("/security/redact")
async def redact_test(text: str):
    """Utility endpoint — redact secrets from a text sample."""
    return {"original_length": len(text), "redacted": security.redact_secrets(text)}


# ── Dashboard ──────────────────────────────────────────────────────────────────

@app.get("/dashboard")
async def dashboard():
    await _maybe_refresh_health()
    sessions = memory.list_sessions()
    runs = workflow_engine.list_runs()
    report = accountant.get_report()
    return {
        "active_sessions": len(sessions),
        "total_cost_usd": report["total_cost_usd"],
        "total_tokens": report["total_tokens"],
        "active_runs": sum(1 for r in runs if r.status.value == "running"),
        "provider_health": {
            pid: router._health_cache.get(pid, "unknown").value
                 if hasattr(router._health_cache.get(pid, "unknown"), "value")
                 else str(router._health_cache.get(pid, "unknown"))
            for pid in providers
        },
        "available_agents": len(agent_registry.list_agents()),
        "mcp_tools": len(mcp.list_tools()),
        "configured_providers": registry.configured_providers(),
        "privacy": security.get_privacy_summary(),
        "claude_efficiency": report.get("claude_efficiency", {}),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# IDE / FILE MANAGER ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
from .core.file_manager import FileManager
from .core.user_config import UserConfigStore, ProviderConfig, KNOWN_PROVIDERS

file_mgr = FileManager()
user_cfg = UserConfigStore()


class WriteFileRequest(BaseModel):
    content: str


class CreateRequest(BaseModel):
    is_dir: bool = False


class RenameRequest(BaseModel):
    new_name: str


class SearchRequest(BaseModel):
    query: str
    path: str = ""
    extensions: Optional[List[str]] = None


def _entry_to_dict(e) -> dict:
    d = {"name": e.name, "path": e.path, "is_dir": e.is_dir, "size": e.size}
    if e.children is not None:
        d["children"] = [_entry_to_dict(c) for c in e.children]
    return d


@app.get("/files")
async def list_files(path: str = "", depth: int = 4):
    entries = file_mgr.list_dir(path, depth=depth)
    return [_entry_to_dict(e) for e in entries]


@app.get("/files/read")
async def read_file_endpoint(path: str):
    try:
        content = file_mgr.read_file(path)
        return {"path": path, "content": content}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/files/write")
async def write_file_endpoint(path: str, req: WriteFileRequest):
    try:
        result = file_mgr.write_file(path, req.content)
        return result
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/files/create")
async def create_file_endpoint(path: str, req: CreateRequest):
    try:
        if req.is_dir:
            return file_mgr.create_dir(path)
        return file_mgr.create_file(path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/files/delete")
async def delete_file_endpoint(path: str):
    try:
        return file_mgr.delete(path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.post("/files/rename")
async def rename_file_endpoint(path: str, req: RenameRequest):
    try:
        return file_mgr.rename(path, req.new_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/files/search")
async def search_files(req: SearchRequest):
    return file_mgr.search(req.query, req.path, req.extensions)


@app.get("/files/workspace")
async def get_workspace():
    return {"workspace": file_mgr.workspace_path}


# ── AI Code Actions ────────────────────────────────────────────────────────────

class CodeActionRequest(BaseModel):
    action: str                          # explain | refactor | fix | test | document | complete | chat
    code: str = ""                       # selected code or empty (backend reads file if file_path given)
    language: str = "python"
    file_path: str = ""                  # relative path inside workspace — backend reads full file
    file_context: str = ""               # surrounding lines (caller may pre-supply)
    error_context: str = ""              # stderr / traceback for fix action
    user_message: str = ""               # free-form chat message
    policy: PolicyType = PolicyType.BALANCED


# ── Language-specific system prompts ──────────────────────────────────────────
_LANG_RULES: Dict[str, str] = {
    "python": (
        "Use Python 3.10+ idioms. Prefer dataclasses, type hints on every function signature, "
        "pathlib over os.path, f-strings, list/dict comprehensions, and contextlib. "
        "Follow PEP 8. Never use bare `except:`. Never use `eval` or `exec`. "
        "Use pytest for tests. Raise specific exceptions with messages."
    ),
    "typescript": (
        "Use TypeScript strict mode. Prefer `const`, arrow functions, async/await over callbacks. "
        "Always type function signatures. Use React functional components with hooks. "
        "Avoid `any`. Use optional chaining (?.) and nullish coalescing (??)."
    ),
    "javascript": (
        "Use ES2022+ syntax. Prefer `const`/`let`, arrow functions, async/await, optional chaining. "
        "Never use `var`. Always handle Promise rejections. Use template literals."
    ),
    "go": (
        "Follow effective Go. Return errors as values, never panic in library code. "
        "Use interfaces for abstraction. Prefer composition over inheritance."
    ),
    "rust": (
        "Prefer idiomatic Rust: use Result/Option instead of unwrap in library code, "
        "use iterators, avoid unnecessary clones, use derive macros."
    ),
    "java": (
        "Use Java 17+ features: records, sealed classes, switch expressions, var. "
        "Follow SOLID principles. Use Optional instead of null returns."
    ),
}

_BASE_SYSTEM = """You are an expert software engineer embedded in a coding IDE.
Your output will be inserted directly into the user's editor — so code quality, correctness, and efficiency are critical.

Rules:
- Generated code must compile/run without modification.
- Match the style, naming conventions, and patterns already in the file.
- Never add placeholder comments like '# TODO' or '# Add logic here'.
- Never truncate code with '...' or 'rest of code here'.
- When returning code, wrap it in a single fenced block with the correct language tag.
- Be concise in explanations — developers prefer code over prose.
- If the code has dependencies, use only what is already imported in the file.
"""


def _build_ide_messages(req: "CodeActionRequest") -> List[Dict]:
    """Build a high-quality, context-rich prompt for IDE code actions."""
    lang = req.language.lower()
    lang_rules = _LANG_RULES.get(lang, "")

    system = _BASE_SYSTEM
    if lang_rules:
        system += f"\nLanguage-specific rules ({lang}):\n{lang_rules}"

    # Read file content if file_path provided and code is empty
    full_file_content = ""
    if req.file_path and not req.code:
        try:
            full_path = _os.path.join(file_mgr.workspace, req.file_path.lstrip("/\\"))
            if _os.path.isfile(full_path) and _os.path.getsize(full_path) < 200_000:
                full_file_content = open(full_path, encoding="utf-8", errors="replace").read()
        except Exception:
            pass

    # Decide what code to work on
    working_code = req.code or full_file_content or req.file_context

    # Build context block — what the model needs to understand the surrounding code
    context_parts = []
    if req.file_path:
        context_parts.append(f"File: {req.file_path}")
    if full_file_content and req.code and req.code != full_file_content:
        # Show full file as context, selected code separately
        context_parts.append(
            f"Full file for context:\n```{lang}\n{full_file_content[:6000]}"
            + ("…[truncated]" if len(full_file_content) > 6000 else "")
            + f"\n```\n\nSelected code to work on:\n```{lang}\n{req.code}\n```"
        )
    elif working_code:
        context_parts.append(f"```{lang}\n{working_code[:8000]}"
                              + ("…[truncated]" if len(working_code) > 8000 else "")
                              + "\n```")

    code_block = "\n\n".join(context_parts)

    # Action-specific instructions
    action_instructions = {
        "explain": (
            "Explain this code. Cover:\n"
            "1. What it does (one sentence)\n"
            "2. How it works (step by step, concise)\n"
            "3. Any edge cases, gotchas, or non-obvious behaviour\n"
            "4. Time/space complexity if relevant\n"
            "Be direct — no filler words."
        ),
        "refactor": (
            "Refactor this code for:\n"
            "- Readability and maintainability\n"
            "- Performance (if there are obvious wins)\n"
            "- Idiomatic style for the language\n"
            "- Removing duplication\n\n"
            "Return the complete refactored code in a single code block. "
            "After the code block, add a brief bullet list of what changed and why."
        ),
        "fix": (
            "Fix all bugs in this code.\n"
            + (f"Error/traceback:\n```\n{req.error_context}\n```\n\n" if req.error_context else "")
            + "Return the complete fixed code in a single code block. "
            "After the code, briefly explain what was wrong and what you changed."
        ),
        "test": (
            f"Write comprehensive unit tests for this {lang} code.\n"
            "Requirements:\n"
            "- Cover all public functions/methods\n"
            "- Include happy path, edge cases, and error cases\n"
            "- Use the standard test framework for this language "
            f"({'pytest' if lang == 'python' else 'jest' if lang in ('javascript','typescript') else 'standard library'})\n"
            "- Tests must be runnable without modification\n"
            "- Use descriptive test names that explain what is being tested\n"
            "- Mock external dependencies (I/O, network, time)\n"
            "Return only the test code in a single code block."
        ),
        "document": (
            "Add complete documentation to this code:\n"
            f"- {'Docstrings (Google style) for all functions/classes' if lang == 'python' else 'JSDoc comments for all functions' if lang in ('javascript','typescript') else 'Documentation comments for all public items'}\n"
            "- Inline comments for non-obvious logic\n"
            "- Parameter and return type descriptions\n"
            "- Example usage where helpful\n"
            "Return the fully documented code in a single code block. "
            "Do not change any logic."
        ),
        "complete": (
            "Complete the code. Continue exactly from where it left off.\n"
            "Requirements:\n"
            "- Match the existing style precisely\n"
            "- Only add what is needed to make it functional and complete\n"
            "- Do not repeat what is already written\n"
            "Return only the new/completed portion in a code block."
        ),
    }

    # For chat/free-form actions
    if req.action not in action_instructions and req.user_message:
        user_content = f"{req.user_message}"
        if code_block:
            user_content += f"\n\n{code_block}"
        return [
            {"role": "system", "content": system},
            {"role": "user",   "content": user_content},
        ]

    instruction = action_instructions.get(req.action)
    if not instruction:
        # Treat action as a freeform instruction
        instruction = req.action

    user_content = f"{instruction}\n\n{code_block}" if code_block else instruction

    return [
        {"role": "system", "content": system},
        {"role": "user",   "content": user_content},
    ]


@app.post("/ide/action")
async def code_action(req: CodeActionRequest):
    """
    Run an AI code action with rich context.
    The backend reads the full file from disk if file_path is provided,
    so the model always has complete context even when only a snippet is selected.
    """
    messages = _build_ide_messages(req)

    # Route code tasks to the right provider based on action type
    action_to_task = {
        "explain":  "general",
        "refactor": "refactoring",
        "fix":      "debugging",
        "test":     "test_generation",
        "document": "documentation",
        "complete": "code_generation",
    }
    task_type = action_to_task.get(req.action, "code_generation")

    policy = get_policy(req.policy)
    # For code generation tasks, prefer the configured code provider (default: deepseek)
    if task_type in ("code_generation", "refactoring", "debugging", "test_generation") and policy.type == PolicyType.BALANCED:
        from .core.policies import Policy as P, PolicyType as PT
        policy = P(type=PT.BALANCED, name="code-focused", description="",
                   preferred_providers=["deepseek", "openrouter", "openai"],
                   quality_weight=0.5, cost_weight=0.3, latency_weight=0.2)

    max_tokens = 4096 if req.action in ("test", "complete", "refactor") else 2048

    llm_req = LLMRequest(messages=messages, max_tokens=max_tokens)
    trace = trace_store.create(workflow_id="ide", user_request=f"{req.action} · {req.language} · {req.file_path or 'snippet'}")
    response, decision = await router.execute_with_fallback(
        llm_req, policy, agent="ide", trace=trace,
    )
    trace.complete()

    # Validate: if action expects code back, ensure code fence is present
    result = response.content
    if req.action in ("refactor", "fix", "complete", "document", "test"):
        result = validator.validate_code(result, req.language).data or result

    return {
        "action":    req.action,
        "result":    result,
        "provider":  response.provider,
        "model":     response.model,
        "tokens":    response.input_tokens + response.output_tokens,
        "cost_usd":  response.cost_usd,
        "task_type": task_type,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TERMINAL WebSocket
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
from fastapi import WebSocket, WebSocketDisconnect
import subprocess
import threading
import sys


@app.websocket("/terminal")
async def terminal_ws(websocket: WebSocket):
    await websocket.accept()
    workspace = file_mgr.workspace_path

    # Detect shell
    if sys.platform == "win32":
        shell_cmd = ["cmd.exe"]
    else:
        shell_cmd = [os.environ.get("SHELL", "/bin/bash")]

    proc = subprocess.Popen(
        shell_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=workspace,
        bufsize=0,
    )

    # Background thread to stream proc output to websocket
    loop = asyncio.get_event_loop()

    def read_output():
        while proc.poll() is None:
            try:
                chunk = proc.stdout.read(1024)
                if chunk:
                    asyncio.run_coroutine_threadsafe(
                        websocket.send_text(chunk.decode("utf-8", errors="replace")),
                        loop,
                    )
            except Exception:
                break

    thread = threading.Thread(target=read_output, daemon=True)
    thread.start()

    try:
        while True:
            data = await websocket.receive_text()
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.write(data.encode("utf-8"))
                proc.stdin.flush()
    except WebSocketDisconnect:
        proc.terminate()
    except Exception:
        proc.terminate()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# USER API KEY / PROVIDER CONFIGURATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ProviderConfigRequest(BaseModel):
    enabled: bool = True
    api_key: str = ""
    default_model: str = ""
    max_tokens_per_call: int = 0
    max_cost_per_day_usd: float = 0.0
    monthly_budget_usd: float = 0.0
    allowed_task_types: List[str] = []
    blocked_task_types: List[str] = []
    notes: str = ""


@app.get("/user/providers")
async def get_user_providers():
    """Return all known providers with their current user config and live status."""
    all_configs = user_cfg.load_all()
    result = []
    for p in KNOWN_PROVIDERS:
        pid = p["id"]
        cfg = all_configs.get(pid)

        # Determine effective key source
        env_key_name = p["env_key"]
        has_env_key = bool(os.getenv(env_key_name))
        has_user_key = bool(cfg and cfg.api_key)

        result.append({
            "id": pid,
            "name": p["name"],
            "models": p["models"],
            "docs_url": p["docs"],
            "env_key_name": env_key_name,
            "has_env_key": has_env_key,
            "has_user_key": has_user_key,
            "key_source": "user" if has_user_key else ("env" if has_env_key else "none"),
            "is_configured": has_user_key or has_env_key,
            "is_active": pid in providers,  # actually instantiated and running
            "health": router._health_cache.get(pid, "unknown").value
                      if hasattr(router._health_cache.get(pid, "unknown"), "value")
                      else str(router._health_cache.get(pid, "unknown")),
            "config": {
                "enabled": cfg.enabled if cfg else True,
                "default_model": cfg.default_model if cfg else "",
                "max_tokens_per_call": cfg.max_tokens_per_call if cfg else 0,
                "max_cost_per_day_usd": cfg.max_cost_per_day_usd if cfg else 0.0,
                "monthly_budget_usd": cfg.monthly_budget_usd if cfg else 0.0,
                "allowed_task_types": cfg.allowed_task_types if cfg else [],
                "blocked_task_types": cfg.blocked_task_types if cfg else [],
                "notes": cfg.notes if cfg else "",
            } if cfg else None,
        })
    return result


@app.post("/user/providers/{provider_id}")
async def save_user_provider(provider_id: str, req: ProviderConfigRequest):
    """Save user-supplied API key and limits for a provider. Applies immediately."""
    known = {p["id"] for p in KNOWN_PROVIDERS}
    if provider_id not in known:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{provider_id}'")

    cfg = ProviderConfig(
        provider_id=provider_id,
        enabled=req.enabled,
        api_key=req.api_key,
        default_model=req.default_model,
        max_tokens_per_call=req.max_tokens_per_call,
        max_cost_per_day_usd=req.max_cost_per_day_usd,
        monthly_budget_usd=req.monthly_budget_usd,
        allowed_task_types=req.allowed_task_types,
        blocked_task_types=req.blocked_task_types,
        notes=req.notes,
    )
    user_cfg.save(cfg)

    # Hot-reload: add or update the live provider instance if a key was provided
    if req.api_key and req.enabled and provider_id in PROVIDER_MAP:
        model = req.default_model or _default_model(provider_id)
        providers[provider_id] = PROVIDER_MAP[provider_id](api_key=req.api_key, model=model)
        router._circuits[provider_id] = __import__('backend.core.circuit_breaker', fromlist=['CircuitBreaker']).CircuitBreaker(provider_id=provider_id)
        logger.info(f"Hot-loaded provider '{provider_id}' with user-supplied key")
    elif not req.enabled and provider_id in providers:
        del providers[provider_id]
        logger.info(f"Disabled provider '{provider_id}'")

    return {"saved": True, "provider_id": provider_id, "is_active": provider_id in providers}


@app.delete("/user/providers/{provider_id}")
async def delete_user_provider(provider_id: str):
    """Remove user-supplied config (falls back to .env key if present)."""
    user_cfg.delete(provider_id)
    # Re-instantiate from .env if available
    env_map = {p["id"]: (p["env_key"], _default_model(p["id"])) for p in KNOWN_PROVIDERS}
    if provider_id in env_map:
        env_key_name, model = env_map[provider_id]
        key = os.getenv(env_key_name)
        if key and provider_id in PROVIDER_MAP:
            providers[provider_id] = PROVIDER_MAP[provider_id](api_key=key, model=model)
        elif provider_id in providers:
            del providers[provider_id]
    return {"deleted": True, "provider_id": provider_id}


def _default_model(provider_id: str) -> str:
    defaults = {
        "openai": "gpt-4o", "anthropic": "claude-opus-4-5",
        "gemini": "gemini-1.5-pro", "deepseek": "deepseek-chat",
        "kimi": "moonshot-v1-128k", "openrouter": "openai/gpt-4o-mini",
    }
    return defaults.get(provider_id, "")


@app.get("/user/task-types")
async def list_task_types():
    """Return all supported task types for limit configuration."""
    from .core.classifier import TaskType
    return [t.value for t in TaskType]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# WORKSPACE MANAGEMENT — let users browse device folders
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import os as _os

class SetWorkspaceRequest(BaseModel):
    path: str


@app.post("/workspace/set")
async def set_workspace(req: SetWorkspaceRequest):
    """Change the active workspace to any absolute path on the device."""
    p = req.path.strip()
    if not _os.path.isabs(p):
        raise HTTPException(status_code=400, detail="Path must be absolute")
    if not _os.path.exists(p):
        raise HTTPException(status_code=404, detail=f"Path does not exist: {p}")
    if not _os.path.isdir(p):
        raise HTTPException(status_code=400, detail="Path must be a directory")
    file_mgr.workspace = p
    return {"workspace": p, "status": "ok"}


@app.get("/workspace/drives")
async def list_drives():
    """List available drives / root folders (Windows: C:\\, D:\\  |  Unix: /)"""
    import string, subprocess, sys as _sys
    roots = []
    if _sys.platform == "win32":
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if _os.path.exists(drive):
                roots.append({"path": drive, "label": drive})
    else:
        roots.append({"path": "/", "label": "/"})
        home = _os.path.expanduser("~")
        roots.append({"path": home, "label": "Home (~)"})
    return roots


@app.get("/workspace/browse")
async def browse_dir(path: str = ""):
    """List immediate children of any path on the device (no depth limit guard)."""
    target = path or _os.path.expanduser("~")
    if not _os.path.isdir(target):
        raise HTTPException(status_code=404, detail=f"Not a directory: {target}")
    entries = []
    try:
        for name in sorted(_os.listdir(target)):
            full = _os.path.join(target, name)
            try:
                is_dir = _os.path.isdir(full)
                size = 0 if is_dir else _os.path.getsize(full)
                entries.append({"name": name, "path": full, "is_dir": is_dir, "size": size})
            except PermissionError:
                pass
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {"path": target, "entries": entries}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OPTIMIZATION TARGET — which LLM is the "orchestrator" and what are the others
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import json as _json
import sqlite3 as _sqlite3

_OPT_DB = _os.getenv("CORTEX_STATE_DB", _os.path.join(_os.path.expanduser("~"), "AppData", "Local", "Temp", "cortex_state.db"))


def _get_optimization_config() -> dict:
    try:
        with _sqlite3.connect(_OPT_DB) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS optimization_config (
                    key TEXT PRIMARY KEY, value TEXT NOT NULL
                )
            """)
            row = conn.execute("SELECT value FROM optimization_config WHERE key='config'").fetchone()
            if row:
                return _json.loads(row[0])
    except Exception:
        pass
    # Defaults
    return {
        "orchestrator": "anthropic",
        "orchestrator_role": "Architecture approval, conflict resolution, final quality gate",
        "worker_roles": {
            "deepseek":   "code_generation,debugging,refactoring,test_generation",
            "kimi":       "repository_analysis,long_context,documentation",
            "gemini":     "architecture_design,multimodal_analysis,research",
            "openai":     "structured_extraction,security_review,final_verification",
            "openrouter": "general",
        },
        "optimize_for": "cost",   # cost | quality | latency | balanced
        "budget_policy": {
            "enabled": True,
            "max_calls_per_workflow": 3,
            "max_input_tokens_per_call": 12000,
            "allowed_tasks": ["architecture_approval","conflict_resolution","critical_security_review","final_quality_gate","final_verification"],
        },
    }


def _save_optimization_config(cfg: dict) -> None:
    try:
        with _sqlite3.connect(_OPT_DB) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS optimization_config (
                    key TEXT PRIMARY KEY, value TEXT NOT NULL
                )
            """)
            conn.execute(
                "INSERT OR REPLACE INTO optimization_config (key, value) VALUES ('config', ?)",
                (_json.dumps(cfg),)
            )
            conn.commit()
    except Exception as e:
        logger.warning(f"Failed to save optimization config: {e}")


class OptimizationConfigRequest(BaseModel):
    orchestrator: str
    orchestrator_role: str = ""
    worker_roles: dict = {}
    optimize_for: str = "balanced"
    budget_policy: dict = {}


@app.get("/optimization/config")
async def get_optimization_config():
    cfg = _get_optimization_config()
    # Enrich with live provider info
    available = list(providers.keys())
    return {
        **cfg,
        "available_providers": available,
        "provider_info": {
            pid: {
                "name": p.meta.name,
                "models": p.meta.models,
                "cost_per_1k_input": p.meta.cost_per_1k_input,
                "cost_per_1k_output": p.meta.cost_per_1k_output,
                "capabilities": {
                    "code": p.meta.capabilities.code,
                    "reasoning": p.meta.capabilities.reasoning,
                    "vision": p.meta.capabilities.vision,
                    "long_context": p.meta.capabilities.long_context,
                },
            }
            for pid, p in providers.items()
        },
    }


@app.post("/optimization/config")
async def save_optimization_config(req: OptimizationConfigRequest):
    cfg = {
        "orchestrator": req.orchestrator,
        "orchestrator_role": req.orchestrator_role,
        "worker_roles": req.worker_roles,
        "optimize_for": req.optimize_for,
        "budget_policy": req.budget_policy,
    }
    _save_optimization_config(cfg)

    # Hot-apply: update the budget policy in the accountant
    bp = req.budget_policy
    if bp:
        accountant.claude_budget.enabled = bp.get("enabled", True)
        accountant.claude_budget.maximum_calls_per_workflow = bp.get("max_calls_per_workflow", 3)
        accountant.claude_budget.maximum_input_tokens_per_call = bp.get("max_input_tokens_per_call", 12000)
        accountant.claude_budget.allowed_tasks = bp.get("allowed_tasks", [])

    # Update routing policy in registry based on worker_roles
    for pid, tasks_str in req.worker_roles.items():
        task_list = [t.strip() for t in tasks_str.split(",") if t.strip()]
        for task in task_list:
            existing = registry.get_routing_policy(task)
            if existing.get("primary") != pid:
                registry._routing_policy[task] = {"primary": pid, "fallback": req.orchestrator}

    logger.info(f"Optimization config updated: orchestrator={req.orchestrator} optimize_for={req.optimize_for}")
    return {"saved": True, "orchestrator": req.orchestrator}


@app.get("/optimization/report")
async def optimization_report():
    """Returns efficiency report for the configured orchestrator (not just Claude)."""
    cfg = _get_optimization_config()
    orchestrator_id = cfg.get("orchestrator", "anthropic")

    report = accountant.get_report()
    by_provider = report["by_provider"]
    total_tokens = report["total_tokens"]
    total_cost = report["total_cost_usd"]

    orch_data = by_provider.get(orchestrator_id, {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "calls": 0})
    orch_tokens = orch_data.get("input_tokens", 0) + orch_data.get("output_tokens", 0)
    orch_pct = round(orch_tokens / total_tokens * 100, 1) if total_tokens else 0.0

    # Find most expensive provider for savings calc
    orch_provider = providers.get(orchestrator_id)
    orch_out_rate = orch_provider.meta.cost_per_1k_output if orch_provider else 0.075

    workers = {pid: v for pid, v in by_provider.items() if pid != orchestrator_id}
    delegated_tasks = sum(v["calls"] for v in workers.values())
    estimated_savings = round(
        sum(v["cost_usd"] for v in workers.values()) * (orch_out_rate / 0.015), 4
    )

    return {
        "orchestrator": orchestrator_id,
        "optimize_for": cfg.get("optimize_for", "balanced"),
        "orchestrator_usage": {
            "calls": orch_data.get("calls", 0),
            "tokens": orch_tokens,
            "cost_usd": round(orch_data.get("cost_usd", 0), 6),
            "percentage_of_total": orch_pct,
        },
        "workers": {
            pid: {**v, "percentage": round((v["input_tokens"] + v["output_tokens"]) / total_tokens * 100, 1) if total_tokens else 0}
            for pid, v in workers.items()
        },
        "delegation": {
            "tasks_delegated_away_from_orchestrator": delegated_tasks,
            "estimated_savings_usd": estimated_savings,
            "total_cost_usd": total_cost,
            "total_tokens": total_tokens,
        },
    }
