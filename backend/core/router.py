from __future__ import annotations
"""
Model Router - selects provider+model using the task classification,
routing policy from the model registry, circuit breakers, privacy tier,
and active user policy.

Enforces:
  - Claude budget policy (call count + token limits per workflow)
  - Context compression before escalating to Claude (Kimi summarises first)
  - Provider privacy tier restrictions
  - Circuit-breaker gated fallback chain
"""
import logging
from dataclasses import dataclass
from typing import Optional, List

from ..providers.base import BaseProvider, LLMRequest, LLMResponse, ProviderStatus
from .policies import Policy, PolicyType
from .classifier import TaskClassifier, TaskClassification, TaskType
from .circuit_breaker import CircuitBreaker, with_retry
from .token_accounting import TokenAccountant, UsageRecord
from .discovery import ModelRegistry
from .observability import TraceStore, ExecutionTrace, TraceEvent

logger = logging.getLogger(__name__)


@dataclass
class RoutingDecision:
    provider_id: str
    model: str
    reason: str
    fallback_chain: list[str]
    estimated_cost_usd: float
    estimated_latency_ms: int
    task_classification: Optional[TaskClassification] = None

    def summary(self) -> str:
        """Return a one-line human-readable summary of this routing decision."""
        return (
            f"{self.provider_id}/{self.model} "
            f"(est. ${self.estimated_cost_usd:.4f}, ~{self.estimated_latency_ms}ms) "
            f"- {self.reason}"
        )


class TaskRouter:
    def __init__(
        self,
        providers: dict[str, BaseProvider],
        registry: Optional[ModelRegistry] = None,
        accountant: Optional[TokenAccountant] = None,
        trace_store: Optional[TraceStore] = None,
        security_engine=None,
    ):
        self.providers = providers
        self.registry = registry or ModelRegistry()
        self.accountant = accountant or TokenAccountant()
        self.trace_store = trace_store or TraceStore()
        self._security = security_engine
        self._classifier = TaskClassifier()
        self._health_cache: dict[str, ProviderStatus] = {}
        self._circuits: dict[str, CircuitBreaker] = {
            pid: CircuitBreaker(provider_id=pid) for pid in providers
        }

    async def refresh_health(self) -> None:
        for pid, p in self.providers.items():
            try:
                self._health_cache[pid] = await p.health_check()
            except Exception:
                self._health_cache[pid] = ProviderStatus.DOWN

    def _is_available(self, provider_id: str) -> bool:
        status = self._health_cache.get(provider_id, ProviderStatus.UNKNOWN)
        circuit = self._circuits.get(provider_id)
        if circuit and not circuit.allow_request():
            return False
        return status in (ProviderStatus.HEALTHY, ProviderStatus.DEGRADED, ProviderStatus.UNKNOWN)

    def _score_provider(
        self,
        provider_id: str,
        classification: TaskClassification,
        policy: Policy,
    ) -> float:
        if provider_id not in self.providers:
            return 0.0
        meta = self.providers[provider_id].meta

        # Hard capability filters
        if classification.requires_vision and not meta.capabilities.vision:
            return 0.0
        if classification.requires_long_context and meta.capabilities.max_context_tokens < 32000:
            return 0.0

        # Normalise cost score against the most expensive configured provider
        max_cost = max(
            (self.providers[p].meta.cost_per_1k_output for p in self.providers),
            default=0.1,
        ) or 0.1
        cost_score = 1.0 - min(meta.cost_per_1k_output / max_cost, 1.0)
        max_latency = max(
            (self.providers[p].meta.avg_latency_ms for p in self.providers),
            default=3000,
        ) or 3000
        latency_score = 1.0 - min(meta.avg_latency_ms / max_latency, 1.0)

        quality_score = 0.1
        if meta.capabilities.reasoning:
            quality_score += 0.25
        if meta.capabilities.code and classification.requires_code:
            quality_score += 0.25
        if meta.capabilities.long_context and classification.requires_long_context:
            quality_score += 0.15
        if meta.capabilities.vision and classification.requires_vision:
            quality_score += 0.15
        if meta.capabilities.function_calling and classification.requires_tools:
            quality_score += 0.1
        quality_score = min(quality_score, 1.0)

        score = (
            quality_score * policy.quality_weight
            + cost_score * policy.cost_weight
            + latency_score * policy.latency_weight
        )

        # Policy preferred providers bonus
        if meta.id in policy.preferred_providers:
            idx = policy.preferred_providers.index(meta.id)
            score += 0.15 - (idx * 0.05)

        # Registry routing policy bonus
        task_policy = self.registry.get_routing_policy(classification.task_type.value)
        if task_policy.get("primary") == provider_id:
            score += 0.2
        elif task_policy.get("fallback") == provider_id:
            score += 0.05

        return score

    # -- Context compression ---------------------------------------------------

    async def _compress_for_claude(
        self,
        request: LLMRequest,
        classification: TaskClassification,
    ) -> LLMRequest:
        """
        Before sending a large context to Claude, use Kimi (long-context specialist)
        to produce a structured summary, then send Claude only the summary + decision.
        Falls back to the original request if Kimi is unavailable or context is small.
        """
        # Only compress if context is large enough to matter
        if classification.estimated_context_tokens < 4000:
            return request

        kimi = self.providers.get("kimi")
        if not kimi or not self._is_available("kimi"):
            logger.info("Context compression: Kimi unavailable - sending full context to Claude")
            return request

        full_text = "\n".join(
            m.get("content", "") for m in request.messages
            if isinstance(m.get("content"), str)
        )

        compress_req = LLMRequest(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a context compression specialist. "
                        "Produce a structured summary that preserves all decision-relevant facts, "
                        "constraints, competing options, and risks. "
                        "Remove redundant text, examples, and verbose explanations. "
                        "Output format: Decision Required / Constraints / Evidence / Options / Risks / Recommendation."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Compress the following context for a senior reviewer "
                        f"(keep only what is needed to make a final decision):\n\n{full_text[:60000]}"
                    ),
                },
            ],
            max_tokens=2000,
        )

        try:
            circuit = self._circuits.get("kimi", CircuitBreaker(provider_id="kimi"))
            summary_resp = await with_retry(
                lambda: kimi.complete(compress_req),
                provider_id="kimi",
                circuit=circuit,
            )
            self.accountant.record(UsageRecord(
                provider="kimi",
                model=summary_resp.model,
                agent="context_compressor",
                task_type="context_compression",
                input_tokens=summary_resp.input_tokens,
                output_tokens=summary_resp.output_tokens,
                cost_usd=summary_resp.cost_usd,
                latency_ms=summary_resp.latency_ms,
            ))

            # Replace messages with compressed version
            original_user = next(
                (m["content"] for m in reversed(request.messages) if m.get("role") == "user"),
                "",
            )
            compressed_messages = [
                {
                    "role": "system",
                    "content": (
                        "You are the senior architecture reviewer and final quality gate. "
                        "Make the final decision based on the compressed context provided."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"COMPRESSED CONTEXT (summarised by Kimi from "
                        f"{classification.estimated_context_tokens} tokens):\n\n"
                        f"{summary_resp.content}\n\n"
                        f"ORIGINAL REQUEST:\n{original_user}"
                    ),
                },
            ]
            logger.info(
                f"Context compressed: {classification.estimated_context_tokens} → "
                f"~{summary_resp.output_tokens * 4} chars via Kimi"
            )
            return LLMRequest(
                messages=compressed_messages,
                model=request.model,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                stream=request.stream,
                tools=request.tools,
            )

        except Exception as e:
            logger.warning(f"Context compression failed: {e} - using original")
            return request

    # -- Routing ---------------------------------------------------------------

    async def route(
        self,
        request: LLMRequest,
        policy: Policy,
        workflow_id: str = "",
    ) -> RoutingDecision:
        classification = self._classifier.classify(request.messages, budget_hint=policy.type.value)

        # Claude budget enforcement
        if workflow_id:
            allowed, reason = self.accountant.check_claude_allowed(
                workflow_id,
                classification.task_type.value,
                classification.estimated_context_tokens,
            )
            if not allowed:
                logger.info(f"Claude blocked: {reason} - routing to fallback")
                policy = Policy(
                    type=policy.type, name=policy.name, description=policy.description,
                    avoid_providers=list(set(policy.avoid_providers + ["anthropic"])),
                    preferred_providers=[p for p in policy.preferred_providers if p != "anthropic"],
                    quality_weight=policy.quality_weight,
                    cost_weight=policy.cost_weight,
                    latency_weight=policy.latency_weight,
                )

        candidates: list[tuple[str, float]] = []
        for pid in self.providers:
            if pid in policy.avoid_providers:
                continue
            if not self._is_available(pid):
                continue
            if self._security and not self._security.is_provider_allowed(pid)[0]:
                logger.info(f"Provider '{pid}' blocked by privacy tier")
                continue
            if policy.max_latency_ms:
                meta = self.providers[pid].meta
                if meta.avg_latency_ms > policy.max_latency_ms:
                    continue
            score = self._score_provider(pid, classification, policy)
            if score > 0:
                candidates.append((pid, score))

        if not candidates:
            candidates = [(pid, 0.1) for pid in self.providers if self._is_available(pid)]

        candidates.sort(key=lambda x: x[1], reverse=True)
        if not candidates:
            raise RuntimeError("No providers available")

        best_id = candidates[0][0]
        meta = self.providers[best_id].meta
        model = request.model or meta.models[0]
        est_in = classification.estimated_context_tokens
        est_out = request.max_tokens
        est_cost = est_in / 1000 * meta.cost_per_1k_input + est_out / 1000 * meta.cost_per_1k_output

        return RoutingDecision(
            provider_id=best_id,
            model=model,
            reason=(
                f"Task={classification.task_type.value} "
                f"Complexity={classification.complexity.value} "
                f"Provider={best_id} Score={candidates[0][1]:.2f} "
                f"Policy={policy.name}"
            ),
            fallback_chain=[pid for pid, _ in candidates[1:4]],
            estimated_cost_usd=round(est_cost, 6),
            estimated_latency_ms=meta.avg_latency_ms,
            task_classification=classification,
        )

    # -- Execution -------------------------------------------------------------

    async def execute_with_fallback(
        self,
        request: LLMRequest,
        policy: Policy,
        workflow_id: str = "",
        agent: str = "",
        trace: Optional[ExecutionTrace] = None,
    ) -> tuple[LLMResponse, RoutingDecision]:
        decision = await self.route(request, policy, workflow_id)

        # Context compression before sending to Claude
        actual_request = request
        if decision.provider_id == "anthropic":
            classification = decision.task_classification
            if classification:
                actual_request = await self._compress_for_claude(request, classification)

        chain = [decision.provider_id] + decision.fallback_chain

        for pid in chain:
            if pid not in self.providers:
                continue

            # Re-compress if we fell back to anthropic mid-chain
            req_for_provider = actual_request if pid == decision.provider_id else request
            if pid == "anthropic" and pid != decision.provider_id and decision.task_classification:
                req_for_provider = await self._compress_for_claude(request, decision.task_classification)

            circuit = self._circuits[pid]
            provider = self.providers[pid]
            model = req_for_provider.model if pid == decision.provider_id else None
            req = LLMRequest(
                messages=req_for_provider.messages,
                model=model,
                max_tokens=req_for_provider.max_tokens,
                temperature=req_for_provider.temperature,
                stream=req_for_provider.stream,
                tools=req_for_provider.tools,
            )

            try:
                provider_at_call = provider
                req_at_call = req
                response = await with_retry(
                    lambda: provider_at_call.complete(req_at_call),
                    provider_id=pid,
                    circuit=circuit,
                )

                self.accountant.record(UsageRecord(
                    provider=response.provider,
                    model=response.model,
                    agent=agent,
                    workflow_id=workflow_id,
                    task_type=decision.task_classification.task_type.value if decision.task_classification else "",
                    input_tokens=response.input_tokens,
                    output_tokens=response.output_tokens,
                    cost_usd=response.cost_usd,
                    latency_ms=response.latency_ms,
                ))

                if trace:
                    trace.add_event(TraceEvent(
                        event_type="llm_call",
                        workflow_id=workflow_id,
                        agent=agent,
                        provider=response.provider,
                        model=response.model,
                        input_tokens=response.input_tokens,
                        output_tokens=response.output_tokens,
                        cost_usd=response.cost_usd,
                        latency_ms=response.latency_ms,
                        status="ok",
                        message=f"Routing: {decision.reason}",
                    ))

                return response, decision

            except Exception as e:
                logger.warning(f"Provider {pid} failed: {e}. Trying next in chain.")
                if trace:
                    trace.add_event(TraceEvent(
                        event_type="error",
                        workflow_id=workflow_id,
                        agent=agent,
                        provider=pid,
                        status="error",
                        message=str(e)[:300],
                    ))
                continue

        raise RuntimeError(f"All providers in fallback chain failed: {chain}")
