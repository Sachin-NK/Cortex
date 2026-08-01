# Cortex — AI-Powered Development Environment

Cortex is a multi-provider AI coding assistant with an intelligent task router, workflow engine, and built-in IDE. It routes each task to the best model based on cost, capability, and latency — automatically.

## Features

- **Multi-provider routing** — OpenAI, Anthropic, Gemini, DeepSeek, Kimi, OpenRouter
- **Task classifier** — detects type and complexity to pick the right model
- **Circuit breaker** — automatic failover with exponential backoff
- **Memory subsystem** — workflow, project, agent, and long-term scopes
- **Workflow engine** — parallel steps, retries, approval gates, SQLite checkpointing
- **Security engine** — secret redaction, privacy tiers, path traversal protection
- **MCP tools** — lint, format, diff, regex, JSON, hash, UUID, token estimation
- **Full-stack IDE** — React frontend with file explorer, terminal, AI panel

## Quick Start

```bash
# 1. Copy env and add your API keys
cp .env.example .env

# 2. Start with Docker Compose
docker compose up

# Frontend → http://localhost:3000
# Backend  → http://localhost:8000
```

## Development

```bash
# Backend
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

## Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Backend  | Python 3.12, FastAPI, asyncio           |
| Frontend | React 18, TypeScript, Vite, Tailwind    |
| Storage  | SQLite (state), in-memory (sessions)    |
| Deploy   | Docker Compose, nginx                   |

## License

MIT
