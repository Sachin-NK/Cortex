# Cortex IDE

A multi-model AI-powered coding IDE that routes every task to the right model automatically.
Users bring their own API keys - stored in their browser only, never on the server.

## What it does

- **Smart routing**: DeepSeek for code, Kimi for long context, Gemini for multimodal, OpenAI for structured output, Claude as orchestrator only
- **Monaco editor**: multi-tab, syntax highlighting, 20+ languages, Ctrl+S save
- **AI actions**: Explain, Refactor, Fix Bug, Write Tests, Document, Complete - reads full file context automatically
- **Browser file access**: open any folder from your device directly (File System Access API)
- **Integrated terminal**: WebSocket terminal in the IDE (local mode only)
- **8 built-in agents**: multi-step AI workflows (Code Review, Security Audit, Debugger, REST API Builder, etc.)
- **11 MCP tools**: code linter, JSON validator, regex tester, token estimator, web search, diff, and more
- **Cost analytics**: real-time token/cost tracking per provider with Claude efficiency gauge
- **Optimization settings**: configure which model is the orchestrator, worker roles per provider, budget limits
- **Per-user API keys**: users paste their own keys on the Keys page - no account needed

## Supported providers

| Provider | Best for | Header |
|---|---|---|
| OpenAI | Structured output, security review | `X-OpenAI-Key` |
| Anthropic (Claude) | Orchestration, final approval only | `X-Anthropic-Key` |
| Google Gemini | Multimodal, architecture, long context | `X-Gemini-Key` |
| DeepSeek | Code generation, debugging, refactoring | `X-Deepseek-Key` |
| Kimi (Moonshot) | Long documents, repo analysis | `X-Kimi-Key` |
| OpenRouter | 100+ models via one key (best for new users) | `X-Openrouter-Key` |

## Run locally

```bash
# Clone
git clone https://github.com/Sachin-NK/Cortex.git
cd Cortex

# Backend (Python 3.8+)
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (Node 18+)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 then go to http://localhost:3000/keys to add your API keys.

Or just run `run.bat` from the cortex/ directory on Windows.



Note: the integrated terminal requires a persistent backend (local) - not available on Vercel serverless.

## How API keys work

Keys are stored in browser `localStorage` and sent as HTTP request headers on every call. The backend uses them only for that request - never stored anywhere.

```
User browser
  localStorage: { openai: "sk-...", gemini: "AIza..." }
       |
       | GET /api/chat
       | Headers: X-OpenAI-Key: sk-...
       |          X-Gemini-Key: AIza...
       v
  Vercel / Backend
       |
       | Uses key from header for this request only
       v
  OpenAI / Gemini / etc.
```

## Architecture

```
frontend/          React + Vite + Monaco + xterm
  src/
    pages/         Dashboard, IDE, Chat, Agents, Costs, Keys, Optimization
    components/
      ide/         ActivityBar, FileExplorer, TerminalTabs, CommandPalette...
      AIPanel      Chat / Inline / Review modes

backend/           FastAPI (Python)
  main.py          All API routes + per-request key injection
  core/
    router.py      Smart provider scoring and fallback chain
    classifier.py  Task type detection (13 types)
    workflow.py    Multi-step agent execution + SQLite checkpointing
    memory.py      Session + scoped memory store
    security.py    Secret redaction, tool allowlists, privacy tiers
    token_accounting.py  Cost tracking + Claude budget enforcement
    observability.py     Execution traces
    file_manager.py      Workspace file operations
    user_config.py       Per-provider limit storage
  providers/       OpenAI, Anthropic, Gemini, DeepSeek, Kimi, OpenRouter, Mock
  agents/          8 built-in multi-step workflow definitions
  mcp/             11 developer tools (lint, diff, hash, regex, web search...)

vercel.json        Monorepo deploy: frontend service + backend service
```

## Local .env

Copy `.env.example` to `.env` for local development with server-side keys.
In production on Vercel, users supply their own keys from the browser.
