from providers.base import BaseProvider, LLMRequest, LLMResponse, ProviderMeta, ProviderStatus, ModelCapabilities
from providers.openai import OpenAIProvider
from providers.anthropic import AnthropicProvider
from providers.gemini import GeminiProvider
from providers.deepseek import DeepSeekProvider
from providers.kimi import KimiProvider
from providers.openrouter import OpenRouterProvider
from providers.mock import MockProvider

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
