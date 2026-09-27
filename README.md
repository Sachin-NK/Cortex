# Cortex IDE

A multi-model AI-powered coding IDE that routes every task to the right model automatically.
Users bring their own API keys — stored in their browser only, never on the server.

## Features

- **Monaco editor** — multi-tab, syntax highlighting for 20+ languages, Ctrl+S save, auto-lint on save
- **Smart AI routing** — DeepSeek for code, Kimi for long context, Gemini for multimodal, OpenAI for structured output, Claude as orchestrator only
- **AI actions** — Explain, Refactor, Fix Bug, Write Tests, Document, Complete — reads full file context automatically
- **Browser file access** — open any folder from your device (File System Access API, no backend needed on Vercel)
- **Source control** — built-in Git panel: stage/unstage files, commit, view diff with syntax highlighting
- **Integrated terminal** — WebSocket terminal with dynamic ws/wss URL (works locally and on any domain)
- **8 built-in agents** — multi-step AI workflows with stable checkpointing and resumption
- **11 MCP developer tools** — code linter, JSON validator, regex tester, token estimator, web search, diff, and more
- **Cost analytics** — real-time token/cost tracking per provider, task type, and agent with Claude efficiency gauge
- **Optimization settings** — configure orchestrator, worker roles per provider, budget limits
- **Global error toasts** — all API errors surface as dismissable toast notifications
- **Circuit breakers** — per-provider fault isolation with CLOSED/OPEN/HALF_OPEN state machine and monitoring endpoint
- **Per-user API keys** — users paste their own keys in the browser, sent as headers, never stored server-side

## What was fixed and improved

**Critical bug fixes:**
- Circuit breaker: duplicate `state` property silently dropped the first definition
- Router: lambda capture bug in `execute_with_fallback` caused wrong provider to be called
- Workflow: `eval()` replaced with safe condition parser — no arbitrary code execution
- Workflow: busy-wait dependency loop replaced with proper `asyncio.sleep`
- Token accounting: savings formula was multiplying instead of computing actual delta
- Security: path traversal bypass via non-realpath comparison — fixed with `os.path.realpath`
- Security: removed false-positive hex regex that flagged SHA hashes and UUIDs
- Classifier: `is_high_stakes()` method was defined before all dataclass fields (Python ignores it)
- Agents: step IDs were `uuid4()` at import time — now stable deterministic strings for checkpoint resumption

**Improvements:**
- Router: cost score normalized against actual live providers instead of hardcoded `0.1`
- Classifier: scored multi-keyword detection replaces first-match, adds confidence field
- Workflow: `timeout_seconds` field on WorkflowStep, enforced via `asyncio.wait_for`
- Token accounting: `by_task_type` breakdown added to cost reports
- Security: `get_stats()` for observability
- Circuit breaker: `stats()` method exposing state, failure counts, thresholds
- Git panel: full stage/unstage/commit UI + syntax-colored diff view
- Terminal: dynamic `ws://`/`wss://` URL based on `window.location` — works on Vercel HTTPS
- Global toast system: success/error/info/warning with auto-dismiss and slide animation
- All HTTP errors in `api.ts` automatically surface as toasts

## Supported providers

| Provider | Best for | Header |
|---|---|---|
| OpenAI | Structured output, security review | `X-OpenAI-Key` |
| Anthropic (Claude) | Orchestration, final approval only | `X-Anthropic-Key` |
| Google Gemini | Multimodal, architecture, long context | `X-Gemini-Key` |
| DeepSeek | Code generation, debugging, refactoring | `X-Deepseek-Key` |
| Kimi (Moonshot) | Long documents, repo analysis | `X-Kimi-Key` |
| OpenRouter | 100+ models via one key | `X-Openrouter-Key` |

## Run locally

```bash
git clone https://github.com/Sachin-NK/Cortex.git
cd Cortex

# Backend
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (second terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 then go to `/keys` to add your API keys.
Or run `run.bat` from the `cortex/` directory on Windows.

## Deploy to Vercel (free)

1. Fork this repo
2. Go to [vercel.com/new](https://vercel.com/new) and import your fork
3. Set **Framework** to **Services** in project settings
4. Add environment variables:
   ```
   PRIVACY_TIER=standard
   CORTEX_STATE_DB=/tmp/cortex_state.db
   ENABLE_MOCK_PROVIDER=false
   ```
5. Deploy

Users visit `/setup` on first load to add their own API keys.

Note: the integrated terminal requires a persistent backend (local only) — not available on Vercel serverless.

## Architecture

```
frontend/
  pages/       Dashboard, IDE, Chat, Agents, Costs, Keys, Optimization, Onboarding
  components/
    ide/        ActivityBar, FileExplorer, GitPanel, TerminalTabs, CommandPalette, ...
    AIPanel     Chat / Inline / Review modes with provider selector
    Toast       Global error/success notification system

backend/
  main.py       35+ REST endpoints + WebSocket terminal + Git endpoints
  core/
    router.py         Smart provider scoring, fallback chain, context compression
    classifier.py     13 task types, scored multi-keyword detection, confidence
    workflow.py       Parallel steps, safe conditions, SQLite checkpointing, timeouts
    circuit_breaker.py CLOSED/OPEN/HALF_OPEN with stats() for monitoring
    security.py       Secret redaction, tool allowlists, privacy tiers, realpath checks
    token_accounting.py Cost tracking by provider/agent/task_type, budget enforcement
    memory.py         4-scope memory store with TTL and assumption flagging
    observability.py  Structured execution traces
    file_manager.py   Sandboxed workspace file operations
  providers/    OpenAI, Anthropic, Gemini, DeepSeek, Kimi, OpenRouter, Mock
  agents/       8 built-in multi-step workflow definitions with stable step IDs
  mcp/          11 developer tools

vercel.json     Monorepo Services deploy: frontend + backend on one domain
```

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness probe |
| `GET /providers` | All providers with health status |
| `GET /providers/circuits` | Circuit breaker state for every provider |
| `POST /chat` | Multi-model chat with streaming |
| `POST /ide/action` | AI code actions with full file context |
| `POST /agents/run` | Run a multi-step agent workflow |
| `GET /agents/runs/{id}` | Workflow run status |
| `GET /git/status` | Git status of workspace |
| `POST /git/commit` | Commit staged changes |
| `GET /costs` | Token/cost report by provider, agent, task type |
| `GET /optimization/report` | Orchestrator efficiency report |
| `GET /files/*` | Workspace file CRUD |
| `WS /terminal` | Real-time shell |
