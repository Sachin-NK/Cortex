from __future__ import annotations
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional


class PolicyType(str, Enum):
    MAXIMUM_QUALITY = "maximum_quality"
    LOWEST_COST = "lowest_cost"
    LOWEST_LATENCY = "lowest_latency"
    BALANCED = "balanced"
    PRIVACY_FIRST = "privacy_first"
    LOCAL_ONLY = "local_only"
    CLOUD_ONLY = "cloud_only"
    ENERGY_EFFICIENT = "energy_efficient"
    CUSTOM = "custom"

@dataclass
class Policy:
    type: PolicyType
    name: str
    description: str
    budget_usd: Optional[float] = None
    preferred_providers: list[str] = field(default_factory=list)
    avoid_providers: list[str] = field(default_factory=list)
    max_latency_ms: Optional[int] = None
    local_only: bool = False
    quality_weight: float = 0.33
    cost_weight: float = 0.33
    latency_weight: float = 0.34

    def is_provider_allowed(self, provider_id: str) -> bool:
        return provider_id not in self.avoid_providers


BUILTIN_POLICIES: dict[PolicyType, Policy] = {
    PolicyType.MAXIMUM_QUALITY: Policy(
        type=PolicyType.MAXIMUM_QUALITY,
        name="Maximum Quality",
        description="Use the most capable models regardless of cost",
        preferred_providers=["openai", "anthropic", "gemini"],
        quality_weight=0.8, cost_weight=0.1, latency_weight=0.1,
    ),
    PolicyType.LOWEST_COST: Policy(
        type=PolicyType.LOWEST_COST,
        name="Lowest Cost",
        description="Minimize API costs — great when on a budget",
        preferred_providers=["deepseek", "gemini", "kimi"],
        budget_usd=5.0,
        quality_weight=0.1, cost_weight=0.8, latency_weight=0.1,
    ),
    PolicyType.LOWEST_LATENCY: Policy(
        type=PolicyType.LOWEST_LATENCY,
        name="Lowest Latency",
        description="Fastest response time above all else",
        preferred_providers=["gemini", "openai"],
        max_latency_ms=800,
        quality_weight=0.1, cost_weight=0.1, latency_weight=0.8,
    ),
    PolicyType.BALANCED: Policy(
        type=PolicyType.BALANCED,
        name="Balanced",
        description="Balanced trade-off between quality, cost and speed",
        preferred_providers=["gemini", "deepseek", "openai"],
        quality_weight=0.4, cost_weight=0.3, latency_weight=0.3,
    ),
    PolicyType.PRIVACY_FIRST: Policy(
        type=PolicyType.PRIVACY_FIRST,
        name="Privacy First",
        description="Avoid providers with data retention policies",
        preferred_providers=["anthropic"],
        avoid_providers=["openai"],
        quality_weight=0.5, cost_weight=0.3, latency_weight=0.2,
    ),
    PolicyType.ENERGY_EFFICIENT: Policy(
        type=PolicyType.ENERGY_EFFICIENT,
        name="Energy Efficient",
        description="Prefer smaller, more efficient models",
        preferred_providers=["gemini", "deepseek"],
        quality_weight=0.3, cost_weight=0.4, latency_weight=0.3,
    ),
}


def get_policy(policy_type: PolicyType, custom: Optional[dict] = None) -> Policy:
    if policy_type == PolicyType.CUSTOM and custom:
        return Policy(type=PolicyType.CUSTOM, name="Custom", description="User-defined policy", **custom)
    return BUILTIN_POLICIES.get(policy_type, BUILTIN_POLICIES[PolicyType.BALANCED])
