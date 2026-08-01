"""
Cortex CLI — command-line interface for the Multi-Model AI Agent Harness.

Usage:
    python -m cortex.backend.cli providers discover
    python -m cortex.backend.cli models list
    python -m cortex.backend.cli models test
    python -m cortex.backend.cli agents list
    python -m cortex.backend.cli workflow run rest_api_builder --task "Build auth API"
    python -m cortex.backend.cli workflow status <run_id>
    python -m cortex.backend.cli workflow resume <run_id>
    python -m cortex.backend.cli costs report
    python -m cortex.backend.cli trace show <trace_id>
"""
import argparse
import asyncio
import json
import os
import sys
import textwrap


def _build_providers() -> dict:
    from .providers import PROVIDER_MAP
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
        key = os.getenv(env_key)
        if key:
            providers[pid] = PROVIDER_MAP[pid](api_key=key, model=model)
    if not providers or os.getenv("ENABLE_MOCK_PROVIDER", "false").lower() == "true":
        from .providers.mock import MockProvider
        providers["mock"] = MockProvider()
    return providers


def _separator(char: str = "─", width: int = 70) -> None:
    print(char * width)


# ── providers discover ────────────────────────────────────────────────────────

async def cmd_providers_discover() -> None:
    from .core.discovery import ModelRegistry
    print()
    _separator()
    print("  CORTEX — Provider Discovery")
    _separator()
    registry = ModelRegistry()
    found = registry.discover()
    print(f"\n  Discovered {len(found)} provider(s): {', '.join(found) or 'none configured'}\n")
    print(f"  {'Provider':<14} {'Model':<32} {'Context':<10} {'Input $':<10} {'Output $':<10} {'Available'}")
    _separator("-")
    for entry in registry.list_all():
        avail = "✓" if entry["available"] else "✗"
        print(
            f"  {entry['provider']:<14} {entry['model']:<32} "
            f"{entry['context_window']//1000:<8}K "
            f"${entry['input_cost_per_1k']:<9.5f} "
            f"${entry['output_cost_per_1k']:<9.5f} "
            f"{avail}"
        )
    print()


# ── models list ───────────────────────────────────────────────────────────────

async def cmd_models_list() -> None:
    from .core.discovery import ModelRegistry
    registry = ModelRegistry()
    registry.discover()
    models = registry.list_all()
    print(f"\n  {'Provider':<12} {'Model':<30} {'Ctx':<8} {'Code':<6} {'Vision':<8} {'Reasoning'}")
    _separator("-")
    for m in models:
        cap = m["capabilities"]
        avail = "✓" if m["available"] else "—"
        print(
            f"  {m['provider']:<12} {m['model']:<30} "
            f"{m['context_window']//1000:<6}K "
            f"{'✓' if cap.get('code') else '✗':<6} "
            f"{'✓' if cap.get('vision') else '✗':<8} "
            f"{'✓' if cap.get('reasoning') else '✗'}  [{avail}]"
        )
    print()


# ── models test ───────────────────────────────────────────────────────────────

async def cmd_models_test() -> None:
    from .providers.mock import MockProvider
    from .providers.base import LLMRequest
    print("\n  Testing Mock Provider (no API key required)...")
    mock = MockProvider()
    req = LLMRequest(messages=[{"role": "user", "content": "write code to say hello"}])
    resp = await mock.complete(req)
    print(f"  ✓ mock     {resp.input_tokens}↑ {resp.output_tokens}↓ tokens  preview: {resp.content[:60].strip()}...")

    # Test real providers
    providers = _build_providers()
    print("\n  Testing configured providers (health check)...")
    for pid, p in providers.items():
        if pid == "mock":
            continue
        try:
            status = await p.health_check()
            icon = "✓" if "healthy" in str(status).lower() else "⚠"
            print(f"  {icon} {pid:<12} {status}")
        except Exception as e:
            print(f"  ✗ {pid:<12} ERROR — {e}")
    print()


# ── agents list ───────────────────────────────────────────────────────────────

async def cmd_agents_list() -> None:
    from .agents.registry import AgentRegistry
    reg = AgentRegistry()
    agents = reg.list_agents()
    print(f"\n  Available Agents ({len(agents)}):\n")
    print(f"  {'ID':<26} {'Name':<32} {'Tags':<30} {'Steps'}")
    _separator("-")
    for a in agents:
        tags = ", ".join(a.tags)
        print(f"  {a.id:<26} {a.name:<32} {tags:<30} {len(a.steps)}")
    print()


# ── workflow run ──────────────────────────────────────────────────────────────

async def cmd_workflow_run(
    workflow_name: str,
    task: str,
    policy_name: str = "balanced",
    resume_run_id: Optional[str] = None,
) -> None:
    from .agents.registry import AgentRegistry
    from .core.router import TaskRouter
    from .core.discovery import ModelRegistry
    from .core.token_accounting import TokenAccountant, ClaudeBudgetPolicy
    from .core.workflow import WorkflowEngine, CheckpointStore
    from .core.policies import PolicyType, get_policy

    # Wire up subsystems
    providers = _build_providers()
    registry = ModelRegistry()
    registry.discover()
    accountant = TokenAccountant(ClaudeBudgetPolicy())
    router = TaskRouter(providers, registry=registry, accountant=accountant)
    await router.refresh_health()

    agent_reg = AgentRegistry()
    agent = agent_reg.get_agent(workflow_name)
    if not agent:
        available = [a.id for a in agent_reg.list_agents()]
        print(f"\n  Agent '{workflow_name}' not found.\n  Available: {available}\n")
        return

    checkpoints = CheckpointStore()
    engine = WorkflowEngine(router, checkpoint_store=checkpoints)

    try:
        policy = get_policy(PolicyType(policy_name))
    except ValueError:
        print(f"\n  Unknown policy '{policy_name}'. Valid: balanced, lowest_cost, maximum_quality, lowest_latency, privacy_first\n")
        return

    if resume_run_id:
        existing = engine.get_run(resume_run_id)
        if not existing:
            print(f"\n  Run '{resume_run_id}' not found in checkpoint store.\n")
            return
        print(f"\n  Resuming run {resume_run_id} ({agent.name})...\n")
    else:
        print(f"\n  ╔══ {agent.name} ══")
        print(f"  ║  Task   : {textwrap.shorten(task, 60)}")
        print(f"  ║  Policy : {policy.name}")
        print(f"  ║  Steps  : {len(agent.steps)}")
        print(f"  ╚{'═'*50}\n")

    step_num = [0]

    async def on_step(result):
        step_num[0] += 1
        icon = "✓" if result.status.value == "completed" else ("⏸" if "approval" in result.status.value else "✗")
        print(
            f"  [{icon}] Step {step_num[0]:>2}: {result.step_id:<22} "
            f"via {result.provider or '?':<12} "
            f"{result.tokens:>5} tok  ${result.cost_usd:.5f}"
        )
        if result.output and len(result.output) > 10:
            preview = result.output[:120].replace("\n", " ").strip()
            print(f"       Preview: {preview}...")

    run = await engine.execute(
        agent, task, policy,
        on_step_complete=on_step,
        resume_run_id=resume_run_id,
    )

    _separator()
    print(f"\n  Run ID  : {run.id}")
    print(f"  Status  : {run.status.value}")
    print(f"  Tokens  : {run.total_tokens}")
    print(f"  Cost    : ${run.total_cost_usd:.5f}")

    # Claude efficiency summary
    report = accountant.get_report()
    eff = report.get("claude_efficiency", {})
    claude_pct = eff.get("percentage_of_total", 0)
    delegated = eff.get("tasks_delegated_away_from_claude", 0)
    savings = eff.get("estimated_savings_usd", 0)
    print(f"\n  Claude usage  : {claude_pct:.1f}% of total tokens")
    print(f"  Tasks delegated away from Claude: {delegated}")
    print(f"  Estimated token savings vs all-Claude: ${savings:.4f}\n")


# ── workflow status ───────────────────────────────────────────────────────────

async def cmd_workflow_status(run_id: str) -> None:
    from .core.workflow import CheckpointStore

    if not run_id:
        # List all saved runs
        store = CheckpointStore()
        runs = store.list_runs()
        if not runs:
            print("\n  No persisted runs found.\n")
            return
        print(f"\n  {'Run ID':<38} {'Workflow':<22} {'Status':<14} {'Updated At'}")
        _separator("-")
        for r in runs:
            print(f"  {r['run_id']:<38} {r['workflow_id']:<22} {r['status']:<14} {r['updated_at']:.0f}")
        print()
        return

    store = CheckpointStore()
    data = store.load(run_id)
    if not data:
        print(f"\n  Run '{run_id}' not found in checkpoint store.\n")
        return

    inner = data["data"]
    print(f"\n  Run ID   : {run_id}")
    print(f"  Workflow : {data['workflow_id']}")
    print(f"  Status   : {data['status']}")
    print(f"  Cost     : ${inner.get('total_cost_usd', 0):.5f}")
    print(f"  Tokens   : {inner.get('total_tokens', 0)}")
    print(f"\n  Steps:")
    for sid, r in inner.get("results", {}).items():
        icon = "✓" if r["status"] == "completed" else ("✗" if r["status"] == "failed" else "⏸")
        print(f"    [{icon}] {sid:<25} {r['status']:<14} via {r.get('provider','?')}")
    print()


# ── costs report ──────────────────────────────────────────────────────────────

async def cmd_costs_report() -> None:
    """Prints instructions — live data requires the API server or a workflow run."""
    print("""
  Cost Report
  ───────────
  Option 1 — Run a workflow from the CLI:
    python -m cortex.backend.cli workflow run rest_api_builder --task "Build API"

  Option 2 — Query the running API server:
    curl http://localhost:8000/costs | python -m json.tool

  The report includes:
    - Total tokens and cost by provider, agent, and workflow
    - Claude efficiency (% of total tokens, delegated tasks, savings)
    - Per-workflow breakdown
""")


# ── trace show ────────────────────────────────────────────────────────────────

async def cmd_trace_show(trace_id: str) -> None:
    if not trace_id:
        print("\n  Usage: cortex trace show <trace_id>\n")
        print("  Get trace IDs from: curl http://localhost:8000/traces\n")
        return
    print(f"""
  Trace: {trace_id}
  ─────────────────────────────────────────
  Fetch full trace:
    curl http://localhost:8000/traces/{trace_id} | python -m json.tool

  Or view in the Cortex UI at http://localhost:5173/traces
""")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(
        prog="cortex",
        description="Cortex — Multi-Model AI Agent Harness CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              cortex providers discover
              cortex models list
              cortex models test
              cortex agents list
              cortex workflow run rest_api_builder --task "Build auth API" --policy balanced
              cortex workflow status <run_id>
              cortex workflow resume <run_id>
              cortex costs report
              cortex trace show <trace_id>
        """),
    )
    sub = parser.add_subparsers(dest="group", metavar="COMMAND")

    # providers
    p_providers = sub.add_parser("providers", help="Provider management")
    p_providers.add_argument("action", choices=["discover"])

    # models
    p_models = sub.add_parser("models", help="Model management")
    p_models.add_argument("action", choices=["list", "test"])

    # agents
    p_agents = sub.add_parser("agents", help="Agent management")
    p_agents.add_argument("action", choices=["list"])

    # workflow
    p_workflow = sub.add_parser("workflow", help="Workflow execution")
    p_workflow.add_argument("action", choices=["run", "status", "resume"])
    p_workflow.add_argument("target", nargs="?", default="", help="Workflow name (run) or run ID (status/resume)")
    p_workflow.add_argument("--task", "-t", default="Implement the requested feature", help="Task description for the workflow")
    p_workflow.add_argument("--policy", "-p", default="balanced",
                            choices=["balanced", "lowest_cost", "maximum_quality", "lowest_latency", "privacy_first", "energy_efficient"],
                            help="Routing policy")

    # costs
    p_costs = sub.add_parser("costs", help="Cost accounting")
    p_costs.add_argument("action", choices=["report"])

    # trace
    p_trace = sub.add_parser("trace", help="Execution trace viewer")
    p_trace.add_argument("action", choices=["show"])
    p_trace.add_argument("id", nargs="?", default="", help="Trace ID")

    args = parser.parse_args()

    dispatch = {
        ("providers", "discover"): lambda: cmd_providers_discover(),
        ("models",    "list"):     lambda: cmd_models_list(),
        ("models",    "test"):     lambda: cmd_models_test(),
        ("agents",    "list"):     lambda: cmd_agents_list(),
        ("workflow",  "run"):      lambda: cmd_workflow_run(args.target or "rest_api_builder", args.task, args.policy),
        ("workflow",  "status"):   lambda: cmd_workflow_status(args.target or ""),
        ("workflow",  "resume"):   lambda: cmd_workflow_run(
            _get_workflow_for_run(args.target or ""), args.task, args.policy, resume_run_id=args.target
        ),
        ("costs",     "report"):   lambda: cmd_costs_report(),
        ("trace",     "show"):     lambda: cmd_trace_show(getattr(args, "id", "") or ""),
    }

    key = (args.group, args.action) if args.group else (None, None)
    coro_fn = dispatch.get(key)
    if coro_fn:
        asyncio.run(coro_fn())
    else:
        parser.print_help()


def _get_workflow_for_run(run_id: str) -> str:
    """Look up which workflow a run belongs to so we can resume it."""
    if not run_id:
        return "rest_api_builder"
    from .core.workflow import CheckpointStore
    store = CheckpointStore()
    data = store.load(run_id)
    return data["workflow_id"] if data else "rest_api_builder"


if __name__ == "__main__":
    main()
