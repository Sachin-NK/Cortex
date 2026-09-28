from __future__ import annotations
import os
import logging
from dataclasses import dataclass, field
from typing import Optional, Set

logger = logging.getLogger(__name__)

# Default model metadata when live discovery is unavailable
DEFAULT_REGISTRY: dict[str, dict] = {
    "openai": {
        "enabled": True,
        "models": [
            {"id": "gpt-4o", "context_window": 128000, "input_cost": 0.005, "output_cost": 0.015,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["code_generation", "security_review", "structured_extraction", "final_verification"]},
            {"id": "gpt-4o-mini", "context_window": 128000, "input_cost": 0.00015, "output_cost": 0.0006,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": False, "code": True},
             "recommended_tasks": ["general", "structured_extraction"]},
        ],
    },
    "anthropic": {
        "enabled": True,
        "models": [
            {"id": "claude-opus-4-5", "context_window": 200000, "input_cost": 0.015, "output_cost": 0.075,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["architecture_approval", "conflict_resolution", "critical_security_review", "final_quality_gate"]},
            {"id": "claude-haiku-3-5", "context_window": 200000, "input_cost": 0.00025, "output_cost": 0.00125,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": False, "code": True},
             "recommended_tasks": ["documentation", "general"]},
        ],
    },
    "gemini": {
        "enabled": True,
        "models": [
            {"id": "gemini-1.5-pro", "context_window": 1000000, "input_cost": 0.00125, "output_cost": 0.005,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["repository_analysis", "architecture_design", "multimodal_analysis", "long_context"]},
            {"id": "gemini-1.5-flash", "context_window": 1000000, "input_cost": 0.000075, "output_cost": 0.0003,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": False, "code": True},
             "recommended_tasks": ["general", "documentation"]},
            {"id": "gemini-2.5-pro", "context_window": 1000000, "input_cost": 0.00125, "output_cost": 0.005,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["repository_analysis", "architecture_design", "multimodal_analysis"]},
        ],
    },
    "deepseek": {
        "enabled": True,
        "models": [
            {"id": "deepseek-chat", "context_window": 64000, "input_cost": 0.00014, "output_cost": 0.00028,
             "capabilities": {"vision": False, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["code_generation", "debugging", "refactoring", "test_generation", "documentation"]},
            {"id": "deepseek-coder", "context_window": 128000, "input_cost": 0.00014, "output_cost": 0.00028,
             "capabilities": {"vision": False, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["code_generation", "debugging", "refactoring"]},
        ],
    },
    "kimi": {
        "enabled": True,
        "models": [
            {"id": "moonshot-v1-128k", "context_window": 128000, "input_cost": 0.0012, "output_cost": 0.0012,
             "capabilities": {"vision": False, "tools": True, "structured_output": False, "streaming": True, "reasoning": False, "code": True},
             "recommended_tasks": ["repository_analysis", "long_context", "documentation", "research"]},
        ],
    },
    "openrouter": {
        "enabled": True,
        "models": [
            {"id": "openai/gpt-4o", "context_window": 128000, "input_cost": 0.005, "output_cost": 0.015,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["code_generation", "security_review", "structured_extraction", "final_verification"]},
            {"id": "openai/gpt-4o-mini", "context_window": 128000, "input_cost": 0.00015, "output_cost": 0.0006,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": False, "code": True},
             "recommended_tasks": ["general", "documentation", "structured_extraction"]},
            {"id": "anthropic/claude-opus-4-5", "context_window": 200000, "input_cost": 0.015, "output_cost": 0.075,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["architecture_approval", "critical_security_review", "final_quality_gate"]},
            {"id": "google/gemini-1.5-pro", "context_window": 1000000, "input_cost": 0.00125, "output_cost": 0.005,
             "capabilities": {"vision": True, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["repository_analysis", "architecture_design", "long_context"]},
            {"id": "deepseek/deepseek-chat", "context_window": 64000, "input_cost": 0.00014, "output_cost": 0.00028,
             "capabilities": {"vision": False, "tools": True, "structured_output": True, "streaming": True, "reasoning": True, "code": True},
             "recommended_tasks": ["code_generation", "debugging", "refactoring"]},
            {"id": "meta-llama/llama-3.1-70b-instruct", "context_window": 131072, "input_cost": 0.0009, "output_cost": 0.0009,
             "capabilities": {"vision": False, "tools": True, "structured_output": True, "streaming": True, "reasoning": False, "code": True},
             "recommended_tasks": ["general", "research", "documentation"]},
        ],
    },
}

# Routing policy from spec
DEFAULT_ROUTING_POLICY: dict[str, dict] = {
    "code_generation":      {"primary": "deepseek",  "reviewers": ["openai"]},
    "debugging":            {"primary": "deepseek",  "reviewers": ["openai"]},
    "repository_analysis":  {"primary": "kimi",      "fallback": "deepseek"},
    "long_context":         {"primary": "kimi",      "fallback": "gemini"},
    "multimodal_analysis":  {"primary": "gemini",    "fallback": None},
    "structured_extraction":{"primary": "openai",    "fallback": "gemini"},
    "architecture_design":  {"primary": "gemini",    "final_approver": "anthropic"},
    "security_review":      {"primary": "openai",    "reviewer": "anthropic"},
    "final_verification":   {"primary": "anthropic", "fallback": "openai"},
    "documentation":        {"primary": "deepseek",  "fallback": "kimi"},
    "research":             {"primary": "gemini",    "fallback": "openai"},
    "general":              {"primary": "gemini",    "fallback": "deepseek"},
}


@dataclass
class ModelEntry:
    provider: str
    model_id: str
    context_window: int
    input_cost: float
    output_cost: float
    capabilities: dict
    recommended_tasks: list[str]
    available: bool = True


class ModelRegistry:
    def __init__(self):
        self._models: dict[str, ModelEntry] = {}
        self._routing_policy = dict(DEFAULT_ROUTING_POLICY)
        self._configured_providers: Set[str] = set()

    def discover(self) -> list[str]:
        """Detect which providers are configured via environment variables."""
        env_map = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "gemini": "GEMINI_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
            "kimi": "KIMI_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
        }
        found = []
        for provider, env_key in env_map.items():
            if os.getenv(env_key):
                self._configured_providers.add(provider)
                found.append(provider)
                # Populate model entries
                for m in DEFAULT_REGISTRY.get(provider, {}).get("models", []):
                    key = f"{provider}/{m['id']}"
                    self._models[key] = ModelEntry(
                        provider=provider,
                        model_id=m["id"],
                        context_window=m["context_window"],
                        input_cost=m["input_cost"],
                        output_cost=m["output_cost"],
                        capabilities=m["capabilities"],
                        recommended_tasks=m["recommended_tasks"],
                    )
                logger.info(f"Discovered provider: {provider}")
            else:
                logger.info(f"Provider {provider} not configured (no {env_key})")

        if not found:
            logger.warning("No providers configured — check your .env file")
        return found

    def get_models_for_task(self, task_type: str) -> list[ModelEntry]:
        """Return available models suitable for a task type, ordered by preference."""
        policy = self._routing_policy.get(task_type, self._routing_policy["general"])
        preferred_provider = policy.get("primary")

        results: list[ModelEntry] = []
        # Primary provider first
        if preferred_provider in self._configured_providers:
            results.extend(
                m for m in self._models.values()
                if m.provider == preferred_provider and task_type in m.recommended_tasks
            )
        # Fallback
        fallback = policy.get("fallback")
        if fallback and fallback in self._configured_providers:
            results.extend(
                m for m in self._models.values()
                if m.provider == fallback and m not in results
            )
        # Any remaining configured models that can handle the task
        for m in self._models.values():
            if m not in results and m.provider in self._configured_providers:
                results.append(m)

        return results

    def get_routing_policy(self, task_type: str) -> dict:
        return self._routing_policy.get(task_type, self._routing_policy["general"])

    def list_all(self) -> list[dict]:
        return [
            {
                "provider": m.provider,
                "model": m.model_id,
                "context_window": m.context_window,
                "input_cost_per_1k": m.input_cost,
                "output_cost_per_1k": m.output_cost,
                "capabilities": m.capabilities,
                "recommended_tasks": m.recommended_tasks,
                "available": m.provider in self._configured_providers,
            }
            for m in self._models.values()
        ]

    def configured_providers(self) -> list[str]:
        return list(self._configured_providers)
