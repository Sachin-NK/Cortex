import time
from typing import AsyncIterator
import anthropic
from .base import BaseProvider, LLMRequest, LLMResponse, ModelCapabilities, ProviderMeta, ProviderStatus


class AnthropicProvider(BaseProvider):
    def __init__(self, api_key: str, model: str = "claude-opus-4-5"):
        super().__init__(api_key)
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.default_model = model

    # ── Supported models ────────────────────────────────────────────────────
    SUPPORTED_MODELS = [
        "claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5",
        "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307",
    ]

    @property
    def meta(self) -> ProviderMeta:
        return ProviderMeta(
            id="anthropic",
            name="Anthropic",
            models=["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"],
            cost_per_1k_input=0.015,
            cost_per_1k_output=0.075,
            avg_latency_ms=1500,
            capabilities=ModelCapabilities(
                vision=True, function_calling=True, streaming=True,
                long_context=True, code=True, reasoning=True, max_context_tokens=200000
            ),
        )

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.default_model
        # Separate system message
        system = next((m["content"] for m in request.messages if m["role"] == "system"), None)
        msgs = [m for m in request.messages if m["role"] != "system"]
        start = time.time()
        kwargs = dict(model=model, messages=msgs, max_tokens=request.max_tokens)
        if system:
            kwargs["system"] = system
        resp = await self.client.messages.create(**kwargs)
        latency = int((time.time() - start) * 1000)
        usage = resp.usage
        cost = (usage.input_tokens / 1000 * self.meta.cost_per_1k_input +
                usage.output_tokens / 1000 * self.meta.cost_per_1k_output)
        return LLMResponse(
            content=resp.content[0].text,
            model=model, provider="anthropic",
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            latency_ms=latency, cost_usd=cost,
        )

    async def stream(self, request: LLMRequest) -> AsyncIterator[str]:
        model = request.model or self.default_model
        system = next((m["content"] for m in request.messages if m["role"] == "system"), None)
        msgs = [m for m in request.messages if m["role"] != "system"]
        kwargs = dict(model=model, messages=msgs, max_tokens=request.max_tokens)
        if system:
            kwargs["system"] = system
        async with self.client.messages.stream(**kwargs) as s:
            async for text in s.text_stream:
                yield text

    async def health_check(self) -> ProviderStatus:
        try:
            await self.client.models.list()
            return ProviderStatus.HEALTHY
        except Exception:
            return ProviderStatus.DOWN
