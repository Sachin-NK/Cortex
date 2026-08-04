# CORTEX — Pitch Deck
### Multi-Model AI Agent Harness

---

## SLIDE 1 — TITLE

# Cortex
**The brain behind your AI stack.**

> One platform. Five AI providers. Infinite possibilities.

- **Category:** AI Infrastructure / LLM Orchestration
- **Stack:** Python · FastAPI · React · Docker
- **Version:** 2.0.0

---

## SLIDE 2 — THE PROBLEM

### Teams are locked into a single AI provider — and paying the price.

| Pain Point | Reality |
|---|---|
| **Provider lock-in** | One API key, one model, one failure point |
| **Cost overruns** | GPT-4o for every request, even simple ones |
| **No fallback** | One API outage = entire product down |
| **Zero visibility** | No idea which model costs what, or why |
| **Manual routing** | Engineers decide which model to use by hand |

> "We spent $4,000 last month on Claude for tasks DeepSeek could handle at $12."

---

## SLIDE 3 — THE SOLUTION

### Cortex: A unified intelligence layer across all major AI providers.

```
User Request
     │
     ▼
┌-------------------------------------┐
│           CORTEX ROUTER             │
│                                     │
│  Classify → Score → Route → Run     │
│  Circuit Breaker → Fallback Chain   │
└-------------------------------------┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
  OpenAI   Anthropic   Gemini   DeepSeek    Kimi
  GPT-4o   Claude      1.5 Pro  Chat        128K
```

Cortex automatically picks the **best model for the task** — not just your default one.

---

## SLIDE 4 — AI PROVIDERS SUPPORTED

### 5 Providers. 20+ Models. One API.

| Provider | Models | Strength | Cost / 1K output |
|---|---|---|---|
| **OpenAI** | GPT-4o, o1, o3 | Reasoning, vision | $0.015 |
| **Anthropic** | Claude Opus 4.5, Sonnet, Haiku | Safety, long context | $0.075 |
| **Google Gemini** | 1.5 Pro, 2.0 Flash | 1M token context, vision | $0.005 |
| **DeepSeek** | Chat, Coder, Reasoner | Code generation, ultra-low cost | $0.00028 |
| **Kimi (Moonshot)** | v1-8k, 32k, 128k | Long-document analysis | $0.0012 |

> **DeepSeek is 268x cheaper than Claude for code tasks** — Cortex routes there automatically.

---

## SLIDE 5 — HOW IT WORKS (CORE ENGINE)

### 3-Step Intelligence Pipeline

**Step 1 — Classify**
Every request is analyzed for task type, complexity, and capability requirements.
- 13 task types: `code_generation`, `security_review`, `architecture_design`, `debugging`, `research`...
- 4 complexity levels: `low → medium → high → critical`
- Detects: vision needs, long-context requirements, reasoning requirements

**Step 2 — Score**
Each available provider is scored across three dimensions:
```
Score = (quality × policy.quality_weight)
      + (cost    × policy.cost_weight)
      + (latency × policy.latency_weight)
```

**Step 3 — Route + Fallback**
- Best-scored provider runs first
- If it fails → automatic fallback to next best
- Circuit breaker prevents routing to unhealthy providers

---

## SLIDE 6 — ROUTING POLICIES

### 6 Built-in Policies. Switchable per request.

| Policy | Use Case | Weights |
|---|---|---|
| **Maximum Quality** | Critical production tasks | Quality 80%, Cost 10% |
| **Lowest Cost** | High-volume, simple queries | Cost 80%, Quality 10% |
| **Lowest Latency** | Real-time user interfaces | Latency 80% — max 800ms |
| **Balanced** | Default — general use | 40/30/30 split |
| **Privacy First** | Sensitive data — avoids OpenAI | Prefers Anthropic |
| **Energy Efficient** | Sustainability-focused teams | Prefers smaller models |

> Policies can be set per-request, per-session, or as a system default.

---

## SLIDE 7 — AGENT MARKETPLACE

### 8 Pre-Built Multi-Step Agents

Each agent chains multiple specialized models together — each step uses the best model for that specific sub-task.

| Agent | Steps | What it Does |
|---|---|---|
| **Code Reviewer** | 3 | Understand → Bug Scan (Claude) → Report |
| **REST API Builder** | 5 | Architect → Implement (DeepSeek) → Review → Security Audit (Claude) → Docs |
| **Research Agent** | 4 | Plan → Analyze → Synthesize (Claude) → Report |
| **Security Agent** | 4 | Threat Model → Vuln Scan → Risk Assessment → Remediation |
| **DevOps Agent** | 5 | Analyze → Dockerfile → CI/CD → K8s → Review |
| **Data Analyst** | 4 | Understand → Analyze → Insights (Claude) → Report |
| **Debugger** | 4 | Reproduce → Root Cause (Claude) → Fix (DeepSeek) → Tests |
| **Resume Writer** | 4 | Parse → Match → Draft (Claude) → Polish |

> **REST API Builder example:** Gemini architects, DeepSeek codes (268x cheaper), Claude audits security — total cost ~$0.004 vs ~$0.85 if all on Claude.

---

## SLIDE 8 — ENTERPRISE-GRADE FEATURES

### Production-Ready from Day One

**Reliability**
- Circuit breaker per provider — auto-opens after repeated failures
- Retry logic with exponential backoff
- Full fallback chain — never a dead end

**Cost Control**
- Real-time token accounting per provider, agent, and workflow
- Claude budget policy — limits expensive Anthropic calls to critical tasks only
- Live cost dashboard with per-provider breakdown

**Security**
- Prompt injection detection and sanitization
- Tool invocation allowlist
- Output validation — no empty responses, no leaked secrets

**Observability**
- Distributed trace per request — every routing decision logged
- Provider health monitoring with live status dashboard
- Session memory with scoped persistence

**MCP (Model Context Protocol)**
- Extensible tool registry — plug in any external API
- Built-in stubs: Weather, Maps, Hotels
- Concurrent multi-tool invocation

---

## SLIDE 9 — TECH STACK

### Modern, Containerized, Production-Ready

**Backend**
```
Python 3.12  │  FastAPI 2.0  │  Pydantic
Async/Await throughout — handles concurrent LLM calls
```

**Frontend**
```
React 18  │  TypeScript  │  Tailwind CSS  │  Recharts
Vite — sub-second HMR builds
```

**Infrastructure**
```
Docker + Docker Compose
GitHub Actions CI/CD — tests, lint, type-check, build
```

**AI SDKs**
```
openai  │  anthropic  │  google-genai  │  httpx
```

**Frontend Pages**
- Dashboard — live provider health, cost metrics, session stats
- Chat — multi-session, streaming, policy selector, provider override
- Agents — marketplace, run tracking, step-by-step progress, human approval gates
- Workflow Runs — run history, status, outputs
- Providers — cost comparison table, capability matrix

---

## SLIDE 10 — LIVE DEMO FLOW

### What to Show in 3 Minutes

1. **Dashboard** — 5 providers live, cost counter at $0.0000
2. **Chat (Balanced policy)** — ask "write a binary search in Python"
   - Show classifier: `code_generation / medium / DeepSeek routed`
   - Cost: ~$0.00002
3. **Chat (Maximum Quality policy)** — same question
   - Routes to OpenAI/Claude instead
4. **Run REST API Builder agent** — input: "Todo list API"
   - Watch 5 steps execute across 4 different providers in real time
   - Final cost: ~$0.004
5. **Providers page** — show 268x cost difference between DeepSeek and Claude

---

## SLIDE 11 — IMPACT / WHY IT MATTERS

### The Numbers

| Metric | Without Cortex | With Cortex |
|---|---|---|
| Providers supported | 1 | 5 |
| Routing intelligence | Manual / hardcoded | Automatic, policy-driven |
| Failover on outage | None | Automatic fallback chain |
| Cost for code tasks | $0.075 / 1K tokens (Claude) | $0.00028 (DeepSeek) — **268x cheaper** |
| Visibility | None | Full trace, cost, token breakdown |
| Agent workflows | Build from scratch | 8 pre-built, composable |

---

## SLIDE 12 — WHAT WE BUILT (HACKATHON SCOPE)

### Built in Full — Not a Demo

- ✅ 5 fully integrated AI provider clients with streaming
- ✅ Intelligent task classifier (13 types, 4 complexity levels)
- ✅ Policy-based scoring router with circuit breaker
- ✅ 8 multi-step agents with real provider orchestration
- ✅ Token accounting + Claude budget enforcement
- ✅ Distributed trace + observability store
- ✅ Prompt security engine + output validator
- ✅ MCP tool orchestrator with concurrent invocation
- ✅ Full React dashboard with live metrics
- ✅ Docker Compose deployment + GitHub Actions CI
- ✅ 7 test suites (classifier, router, security, workflow, token accounting)

---

## SLIDE 13 — TEAM / CLOSING

### Cortex

> **"The right AI model, for the right task, at the right cost — automatically."**

Built for developers who are tired of:
- Paying GPT-4 rates for GPT-mini tasks
- Scrambling when one API goes down
- Having no idea what their AI stack is actually doing

**Cortex is the infrastructure layer that every AI-first team needs.**

---

*Built at [Hackathon Name] · July 2026*
*Stack: Python · FastAPI · React · TypeScript · Docker*
*Providers: OpenAI · Anthropic · Gemini · DeepSeek · Kimi*
