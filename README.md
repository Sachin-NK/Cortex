# Cortex IDE

Multi-model AI coding IDE. Routes every task to the right model automatically.
Users bring their own API keys — stored in their browser, never on the server.

## Run locally

```bash
git clone https://github.com/Sachin-NK/Cortex.git
cd Cortex

# Backend
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend && npm install && npm run dev
```

Open http://localhost:3000, go to `/keys` to add your API keys.

## Deploy (Vercel - free)

1. Fork this repo
2. Import at [vercel.com/new](https://vercel.com/new)
3. Set framework to **Services**
4. Add env vars: `PRIVACY_TIER=standard`, `CORTEX_STATE_DB=/tmp/cortex_state.db`
5. Deploy

## Providers

| Provider | Use | Header |
|---|---|---|
| OpenAI | Structured output, security review | `X-OpenAI-Key` |
| Anthropic | Orchestration only | `X-Anthropic-Key` |
| Gemini | Multimodal, architecture | `X-Gemini-Key` |
| DeepSeek | Code, debugging, refactoring | `X-Deepseek-Key` |
| Kimi | Long context, repo analysis | `X-Kimi-Key` |
| OpenRouter | 100+ models, one key | `X-Openrouter-Key` |

## Stack

- **Frontend**: React, TypeScript, Vite, Monaco Editor, xterm.js, Tailwind
- **Backend**: FastAPI, Python, SQLite, asyncio
- **Deploy**: Vercel Services (frontend + backend, one domain)
