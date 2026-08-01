"""
OpenRouter provider — OpenAI-compatible gateway that gives access to
100+ models (GPT-4o, Claude, Gemini, Llama, Mistral, etc.) through
a single API key with unified billing.

Docs: https://openrouter.ai/docs
"""
import time
from typing import AsyncIterator
from openai import AsyncOpenAI
from .base import BaseProvider, LLMRequest, LLMResponse, ModelCapabilities, ProviderMeta, ProviderStatus

# Curated list of high-quality models available on OpenRouter
OPENROUTER_MODELS = [
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "anthropic/claude-opus-4-5",
    "anthropic/claude-sonnet-4-5",
    "google/gemini-1.5-pro",
    "google/gemini-1.5-flash",
    "google/gemini-2.5-pro",
    "deepseek/deepseek-chat",
    "meta-llama/llama-3.1-70b-instruct",
    "mistralai/mistral-large",
    "qwen/qwen-2.5-72b-instruct",
]

# Default model — good balance of quality and cost
DEFAULT_MODEL = "openai/gpt-4o-mini"


class OpenRouterProvider(BaseProvider):
    """
    Routes requests through OpenRouter's unified API.
    Supports any model available on OpenRouter via the model field.
    """

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        super().__init__(api_key)
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://github.com/cortex-ai",
                "X-Title": "Cortex Multi-Model AI",
            },
        )
        self.default_model = model

    @property
    def meta(self) -> ProviderMeta:
        return ProviderMeta(
            id="openrouter",
            name="OpenRouter",
            models=OPENROUTER_MODELS,
            # Cost reflects GPT-4o-mini as the default; per-model costs vary
            cost_per_1k_input=0.00015,
            cost_per_1k_output=0.0006,
            avg_latency_ms=1100,
            capabilities=ModelCapabilities(
                vision=True,
                function_calling=True,
                streaming=True,
                long_context=True,
                code=True,
                reasoning=True,
                max_context_tokens=128000,
            ),
        )

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self.default_model
        start = time.time()
        kwargs: dict = dict(
            model=model,
            messages=request.messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )
        if request.tools:
            kwargs["tools"] = request.tools

        resp = await self.client.chat.completions.create(**kwargs)
        latency = int((time.time() - start) * 1000)
        usage = resp.usage

        # OpenRouter returns real token counts; fall back to estimation if missing
        in_tok = usage.prompt_tokens if usage else max(1, sum(len(m.get("content", "")) // 4 for m in request.messages))
        out_tok = usage.completion_tokens if usage else 1

        cost = (in_tok / 1000 * self.meta.cost_per_1k_input +
                out_tok / 1000 * self.meta.cost_per_1k_output)

        return LLMResponse(
            content=resp.choices[0].message.content or "",
            model=model,
            provider="openrouter",
            input_tokens=in_tok,
            output_tokens=out_tok,
            latency_ms=latency,
            cost_usd=cost,
        )

    async def stream(self, request: LLMRequest) -> AsyncIterator[str]:
        model = request.model or self.default_model
        async with await self.client.chat.completions.create(
            model=model,
            messages=request.messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stream=True,
        ) as s:
            async for chunk in s:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield delta

    async def health_check(self) -> ProviderStatus:
        try:
            # Lightweight models list call
            await self.client.models.list()
            return ProviderStatus.HEALTHY
        except Exception:
            return ProviderStatus.DOWN
