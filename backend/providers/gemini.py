from __future__ import annotations
import time
from typing import AsyncIterator

try:
    from google import genai
    from google.genai import types as genai_types
    _NEW_SDK = True
except ImportError:
    try:
        import google.generativeai as genai  # type: ignore
        _NEW_SDK = False
    except ImportError:
        genai = None  # type: ignore
        _NEW_SDK = False

from .base import BaseProvider, LLMRequest, LLMResponse, ModelCapabilities, ProviderMeta, ProviderStatus


class GeminiProvider(BaseProvider):
    def __init__(self, api_key: str, model: str = "gemini-1.5-pro"):
        super().__init__(api_key)
        self.default_model = model

    SUPPORTED_MODELS = [
        "gemini-1.5-pro", "gemini-1.5-flash",
        "gemini-2.0-flash", "gemini-2.5-pro",
    ]
        if _NEW_SDK:
            from google import genai as _genai
            self._client = _genai.Client(api_key=api_key)
        elif genai is not None:
            genai.configure(api_key=api_key)  # type: ignore
            self._client = None
        else:
            self._client = None

    @property
    def meta(self) -> ProviderMeta:
        return ProviderMeta(
            id="gemini",
            name="Google Gemini",
            models=["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
            cost_per_1k_input=0.00125,
            cost_per_1k_output=0.005,
            avg_latency_ms=900,
            capabilities=ModelCapabilities(
                vision=True, function_calling=True, streaming=True,
                long_context=True, code=True, reasoning=True, max_context_tokens=1000000
            ),
        )

    def _messages_to_text(self, messages: list[dict]) -> tuple[str | None, list[dict], str]:
        """Extract system prompt, history, and last user message."""
        system = next((m["content"] for m in messages if m["role"] == "system"), None)
        history = []
        last_user = ""
        for m in messages:
            if m["role"] == "system":
                continue
            role = "model" if m["role"] == "assistant" else "user"
            if m == messages[-1] and m["role"] == "user":
                last_user = m["content"]
            else:
                history.append({"role": role, "parts": [{"text": m["content"]}]})
        if not last_user and messages:
            last_user = messages[-1].get("content", "")
        return system, history, last_user

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model_name = request.model or self.default_model
        system, history, prompt = self._messages_to_text(request.messages)
        start = time.time()

        if _NEW_SDK and self._client:
            contents = []
            for h in history:
                contents.append(genai_types.Content(role=h["role"], parts=[genai_types.Part(text=p["text"]) for p in h["parts"]]))
            contents.append(genai_types.Content(role="user", parts=[genai_types.Part(text=prompt)]))
            config = genai_types.GenerateContentConfig(
                max_output_tokens=request.max_tokens,
                temperature=request.temperature,
                system_instruction=system,
            )
            resp = await self._client.aio.models.generate_content(
                model=model_name, contents=contents, config=config
            )
            text = resp.text or ""
            in_tok = resp.usage_metadata.prompt_token_count if resp.usage_metadata else len(prompt.split()) * 2
            out_tok = resp.usage_metadata.candidates_token_count if resp.usage_metadata else len(text.split())
        elif genai is not None:
            model = genai.GenerativeModel(model_name, system_instruction=system)  # type: ignore
            chat = model.start_chat(history=history)
            resp = await chat.send_message_async(prompt)
            text = resp.text
            in_tok = len(prompt.split()) * 2
            out_tok = len(text.split())
        else:
            raise RuntimeError("No Google AI SDK available. Install google-genai or google-generativeai.")

        latency = int((time.time() - start) * 1000)
        cost = (in_tok / 1000 * self.meta.cost_per_1k_input +
                out_tok / 1000 * self.meta.cost_per_1k_output)

        return LLMResponse(
            content=text, model=model_name, provider="gemini",
            input_tokens=in_tok, output_tokens=out_tok,
            latency_ms=latency, cost_usd=cost,
        )

    async def stream(self, request: LLMRequest) -> AsyncIterator[str]:
        model_name = request.model or self.default_model
        system, history, prompt = self._messages_to_text(request.messages)

        if _NEW_SDK and self._client:
            contents = [genai_types.Content(role="user", parts=[genai_types.Part(text=prompt)])]
            config = genai_types.GenerateContentConfig(
                max_output_tokens=request.max_tokens,
                system_instruction=system,
            )
            async for chunk in await self._client.aio.models.generate_content_stream(
                model=model_name, contents=contents, config=config
            ):
                if chunk.text:
                    yield chunk.text
        elif genai is not None:
            model = genai.GenerativeModel(model_name)  # type: ignore
            chat = model.start_chat(history=history)
            async for chunk in await chat.send_message_async(prompt, stream=True):
                if chunk.text:
                    yield chunk.text
        else:
            raise RuntimeError("No Google AI SDK available.")

    async def health_check(self) -> ProviderStatus:
        try:
            if _NEW_SDK and self._client:
                await self._client.aio.models.get(model=self.default_model)
            elif genai is not None:
                genai.list_models()  # type: ignore
            else:
                return ProviderStatus.DOWN
            return ProviderStatus.HEALTHY
        except Exception:
            return ProviderStatus.DOWN
