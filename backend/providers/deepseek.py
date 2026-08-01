import time
from typing import AsyncIterator
from openai import AsyncOpenAI  # DeepSeek is OpenAI-compatible
from .base import BaseProvider, LLMRequest, LLMResponse, ModelCapabilities, ProviderMeta, ProviderStatus


class DeepSeekProvider(BaseProvider):
    def __init__(self, api_key: str, model: str = "deepseek-chat"):
        super().__init__(api_key)
        self.client = AsyncOpenAI(api_key=api_key, base_url="https://api.deepseek.com/v1")
        self.default_model = model

    SUPPORTED_MODELS = ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"]

    @property
    def meta(self) -> ProviderMeta:
        return ProviderMeta(
            id="deepseek",
            name="DeepSeek",
            models=["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
            cost_per_1k_input=0.00014,
            cost_per_1k_output=0.00028,
            avg_latency_ms=1000,
            capabilities=ModelCapabilities(
                vision=False, function_calling=True, streaming=True,
                long_context=True, code=True, reasoning=True, max_context_tokens=64000
            ),
        )

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.default_model
        start = time.time()
        resp = await self.client.chat.completions.create(
            model=model, messages=request.messages,
            max_tokens=request.max_tokens, temperature=request.temperature,
        )
        latency = int((time.time() - start) * 1000)
        usage = resp.usage
        cost = (usage.prompt_tokens / 1000 * self.meta.cost_per_1k_input +
                usage.completion_tokens / 1000 * self.meta.cost_per_1k_output)
        return LLMResponse(
            content=resp.choices[0].message.content or "",
            model=model, provider="deepseek",
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.completion_tokens,
            latency_ms=latency, cost_usd=cost,
        )

    async def stream(self, request: LLMRequest) -> AsyncIterator[str]:
        model = request.model or self.default_model
        async with await self.client.chat.completions.create(
            model=model, messages=request.messages,
            max_tokens=request.max_tokens, stream=True,
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
