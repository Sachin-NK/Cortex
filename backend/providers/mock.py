"""
Mock Provider — for testing without real API credentials.
Returns deterministic responses based on input content.
"""
import time
import hashlib
from typing import AsyncIterator
from .base import BaseProvider, LLMRequest, LLMResponse, ModelCapabilities, ProviderMeta, ProviderStatus


MOCK_RESPONSES = {
    "code": "```python\ndef solution():\n    # Mock implementation\n    return {'status': 'ok'}\n```",
    "review": '{"summary": "Mock review", "issues": [], "severity": "low", "recommendation": "Looks good"}',
    "document": "# Mock Documentation\n\nThis is a mock documentation response for testing.",
    "test": "```python\ndef test_solution():\n    assert solution() == {'status': 'ok'}\n```",
    "default": "This is a mock response from the test provider. No real API call was made.",
}


class MockProvider(BaseProvider):
    def __init__(self, api_key: str = "mock-key", model: str = "mock-1"):
        super().__init__(api_key)
        self.default_model = model
        self._call_count = 0

    @property
    def meta(self) -> ProviderMeta:
        return ProviderMeta(
            id="mock",
            name="Mock Provider (Testing)",
            models=["mock-1", "mock-fast"],
            cost_per_1k_input=0.0,
            cost_per_1k_output=0.0,
            avg_latency_ms=50,
            capabilities=ModelCapabilities(
                vision=True, function_calling=True, streaming=True,
                long_context=True, code=True, reasoning=True, max_context_tokens=999999
            ),
            status=ProviderStatus.HEALTHY,
        )

    def _pick_response(self, request: LLMRequest) -> str:
        text = " ".join(m.get("content", "") for m in request.messages).lower()
        if any(k in text for k in ["code", "implement", "function", "debug"]):
            return MOCK_RESPONSES["code"]
        if any(k in text for k in ["review", "analyze", "check"]):
            return MOCK_RESPONSES["review"]
        if any(k in text for k in ["document", "readme", "explain"]):
            return MOCK_RESPONSES["document"]
        return MOCK_RESPONSES["default"]

    async def complete(self, request: LLMRequest) -> LLMResponse:
        self._call_count += 1
        content = self._pick_response(request)
        in_tok = sum(len(m.get("content", "").split()) for m in request.messages)
        out_tok = len(content.split())
        return LLMResponse(
            content=content,
            model=self.default_model,
            provider="mock",
            input_tokens=in_tok,
            output_tokens=out_tok,
            latency_ms=50,
            cost_usd=0.0,
            metadata={"call_count": self._call_count},
        )

    async def stream(self, request: LLMRequest) -> AsyncIterator[str]:
        content = self._pick_response(request)
        for word in content.split():
            yield word + " "

    async def health_check(self) -> ProviderStatus:
        return ProviderStatus.HEALTHY
