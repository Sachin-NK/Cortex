from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator
from enum import Enum


class ProviderStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    UNKNOWN = "unknown"


@dataclass
class ModelCapabilities:
    vision: bool = False
    function_calling: bool = False
    streaming: bool = True
    long_context: bool = False
    code: bool = False
    reasoning: bool = False
    max_context_tokens: int = 4096


@dataclass
class ProviderMeta:
    id: str
    name: str
    models: list[str]
    cost_per_1k_input: float   # USD
    cost_per_1k_output: float  # USD
    avg_latency_ms: int
    capabilities: ModelCapabilities = field(default_factory=ModelCapabilities)
    status: ProviderStatus = ProviderStatus.UNKNOWN

    def is_available(self) -> bool:
        """Return True when the provider is healthy or degraded but still usable."""
        return self.status in (ProviderStatus.HEALTHY, ProviderStatus.DEGRADED)


@dataclass
class LLMRequest:
    messages: list[dict]
    model: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.7
    stream: bool = False
    tools: list[dict] | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class LLMResponse:
    content: str
    model: str
    provider: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    cost_usd: float
    metadata: dict = field(default_factory=dict)


class BaseProvider(ABC):
    def __init__(self, api_key: str):
        self.api_key = api_key

    @property
    @abstractmethod
    def meta(self) -> ProviderMeta:
        ...

    @abstractmethod
    async def complete(self, request: LLMRequest) -> LLMResponse:
        ...

    @abstractmethod
    async def stream(self, request: LLMRequest) -> AsyncIterator[str]:
        ...

    @abstractmethod
    async def health_check(self) -> ProviderStatus:
        ...
