import time
from typing import AsyncIterator
from openai import AsyncOpenAI
from .base import BaseProvider, LLMRequest, LLMResponse, ModelCapabilities, ProviderMeta, ProviderStatus


class OpenAIProvider(BaseProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        super().__init__(api_key)
        self.client = AsyncOpenAI(api_key=api_key)
        self.default_model = model

    # -- Supported models ----------------------------------------------------
    SUPPORTED_MODELS = [
        "gpt-4o", "gpt-4o-mini", "gpt-4-turbo",
        "o1", "o1-mini", "o3", "o3-mini",
    ]

    @property
    def meta(self) -> ProviderMeta:
        return ProviderMeta(
            id="openai",
            name="OpenAI",
            models=["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o3"],
            cost_per_1k_input=0.005,
            cost_per_1k_output=0.015,
            avg_latency_ms=1200,
            capabilities=ModelCapabilities(
                vision=True, function_calling=True, streaming=True,
                long_context=True, code=True, reasoning=True, max_context_tokens=128000
            ),
        )

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.default_model
        start = time.time()
        kwargs = dict(model=model, messages=request.messages, max_tokens=request.max_tokens, temperature=request.temperature)
        if request.tools:
            kwargs["tools"] = request.tools
        resp = await self.client.chat.completions.create(**kwargs)
        latency = int((time.time() - start) * 1000)
        usage = resp.usage
        cost = (usage.prompt_tokens / 1000 * self.meta.cost_per_1k_input +
                usage.completion_tokens / 1000 * self.meta.cost_per_1k_output)
        return LLMResponse(
            content=resp.choices[0].message.content or "",
            model=model, provider="openai",
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.completion_tokens,
            latency_ms=latency, cost_usd=cost,
        )

    async def stream(self, request: LLMRequest) -> AsyncIterator[str]:
        model = request.model or self.default_model
        async with await self.client.chat.completions.create(
            model=model, messages=request.messages,
            max_tokens=request.max_tokens, temperature=request.temperature, stream=True
        ) as s:
            async for chunk in s:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

    async def health_check(self) -> ProviderStatus:
        try:
            await self.client.models.list()
            return ProviderStatus.HEALTHY
        except Exception:
            return ProviderStatus.DOWN
