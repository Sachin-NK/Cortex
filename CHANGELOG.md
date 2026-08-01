# Changelog

All notable changes to Cortex are documented here.

## [Unreleased]

### Added
- `test_generator` built-in agent workflow
- `gemini-2.5-pro` to model registry and Gemini/OpenRouter provider model lists
- `WorkflowRun.failed_steps()` and `is_complete()` helpers
- `RoutingDecision.summary()` for human-readable routing logs
- `TaskClassification.is_high_stakes()` helper
- `ValidationResult.first_error()` convenience method
- `Session.add_message()` with rolling cost and token totals
- `ProviderMeta.is_available()` guard method
- `Policy.is_provider_allowed()` helper
- `UsageRecord.total_tokens` computed property
- `FileInfo.from_path()` factory method in file manager
- `ProviderConfig.has_api_key()` guard
- `TraceEvent.to_dict()` JSON serializer
- `CircuitBreaker.state` property with auto OPEN→HALF_OPEN transition
- `SUPPORTED_MODELS` class attribute on all provider classes
- `test` mock response category in MockProvider
- pip-audit security scan job in CI pipeline
- Frontend healthcheck in docker-compose
- `CONTRIBUTING.md` with setup and commit guidelines
- Root `README.md` with quickstart, feature list, and stack table

### Fixed
- Duplicate FastAPI import removed from `main.py`
- `optimize_for` validation in optimization config endpoint
- Disk-level destructive ops added to security command blocklist

## [2.0.0] — Initial Release

### Added
- Multi-provider routing: OpenAI, Anthropic, Gemini, DeepSeek, Kimi, OpenRouter, Mock
- Task classifier with type and complexity detection
- Circuit breaker with exponential backoff
- Multi-scope memory store
- Workflow engine with parallel steps, retries, approval gates, SQLite checkpointing
- Security engine with privacy tiers and secret redaction
- Observability with structured traces
- MCP tool orchestrator
- Agent registry with 9 built-in workflows
- FastAPI backend with 40+ endpoints
- React/TypeScript frontend with IDE, chat, dashboard
- Docker Compose full-stack deployment
- GitHub Actions CI with tests, type-check, and Docker build
