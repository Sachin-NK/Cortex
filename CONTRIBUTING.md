# Contributing to Cortex

## Getting Started

1. Fork the repo and clone your fork.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Install backend deps: `pip install -r backend/requirements.txt`.
4. Install frontend deps: `cd frontend && npm install`.

## Development

- Backend: `uvicorn backend.main:app --reload --port 8000`
- Frontend: `cd frontend && npm run dev`

## Code Style

- Python: follow PEP 8; run `ruff check .` before committing.
- TypeScript: ESLint is configured — run `npm run lint` before committing.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): short description
fix(scope): short description
chore: short description
```

## Pull Requests

- Keep PRs focused — one feature or fix per PR.
- Add tests for new backend logic.
- Update `.env.example` if you add new environment variables.
