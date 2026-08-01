from .base import BaseProvider, LLMRequest, LLMResponse, ProviderMeta, ProviderStatus, ModelCapabilities
from .openai import OpenAIProvider
from .anthropic import AnthropicProvider
from .gemini import GeminiProvider
from .deepseek import DeepSeekProvider
from .kimi import KimiProvider
from .openrouter import OpenRouterProvider
from .mock import MockProvider

PROVIDER_MAP = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "deepseek": DeepSeekProvider,
    "kimi": KimiProvider,
    "openrouter": OpenRouterProvider,
    "mock": MockProvider,
}

__all__ = [
    "BaseProvider", "LLMRequest", "LLMResponse", "ProviderMeta",
    "ProviderStatus", "ModelCapabilities", "PROVIDER_MAP",
    "OpenAIProvider", "AnthropicProvider", "GeminiProvider",
    "DeepSeekProvider", "KimiProvider", "OpenRouterProvider",
]
