# Cortex IDE

A multi-model AI-powered coding IDE. Routes every task to the right model automatically.
Users bring their own API keys — stored in the browser, never on the server.

## Features

- Monaco code editor with multi-tab support
- AI actions: Explain, Refactor, Fix Bug, Write Tests, Document
- Smart routing: DeepSeek for code, Kimi for long context, Gemini for multimodal, OpenAI for structured output
- Claude budget enforcement (orchestrator-only)
- Integrated terminal (WebSocket)
- File explorer with device folder browser
- 8 built-in multi-step AI agents
- 11 MCP developer tools
- Cost analytics and delegation tracking
- Supports: OpenAI, Anthropic, Gemini, DeepSeek, Kimi, OpenRouter

## Run locally

```bash
# Backend (Python 3.8+)
cd cortex
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (Node 18+)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Koyeb (backend) + Vercel (frontend)

### Backend on Koyeb (free, no expiry, no credit card)

1. Push this repo to GitHub
2. Go to https://app.koyeb.com and sign up (free)
3. New Service > GitHub > select your repo
4. Configure:
   - Root directory: `cortex`
   - Build command: `pip install -r backend/requirements.txt`
   - Start command: `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - Instance: Free (512MB)
5. Add environment variables (all optional - users supply their own keys):
   ```
   ENABLE_MOCK_PROVIDER=false
   CORTEX_STATE_DB=/tmp/cortex_state.db
   PRIVACY_TIER=standard
   ```
6. Deploy. Note your Koyeb URL: `https://your-app-name.koyeb.app`

### Frontend on Vercel (free, unlimited)

1. Edit `frontend/vercel.json` - replace `YOUR_RAILWAY_URL` with your actual Koyeb URL
2. Go to https://vercel.com and import your GitHub repo
3. Configure:
   - Framework: Vite
   - Root directory: `cortex/frontend`
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy

### User API keys

Users add their own keys on the `/keys` page. Keys are:
- Stored in browser `localStorage`
- Sent as HTTP headers (`X-OpenAI-Key`, `X-Anthropic-Key`, etc.) with every request
- Never stored on the server

Supported providers:
- OpenAI (`X-OpenAI-Key`)
- Anthropic (`X-Anthropic-Key`)
- Google Gemini (`X-Gemini-Key`)
- DeepSeek (`X-Deepseek-Key`)
- Kimi / Moonshot (`X-Kimi-Key`)
- OpenRouter (`X-Openrouter-Key`) - 100+ models with one key

## Architecture

```
Browser (Vercel)
    |
    | /api/* (vercel.json rewrite)
    |
Koyeb (FastAPI backend)
    |
    +-- OpenAI API (user's key from header)
    +-- Anthropic API
    +-- Gemini API
    +-- DeepSeek API
    +-- Kimi API
    +-- OpenRouter API
```

## Local .env (optional for local dev)

Copy `.env.example` to `.env` and fill in keys for local development.
In production, users supply keys from the browser.
