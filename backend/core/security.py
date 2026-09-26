from __future__ import annotations
"""
Security Policy Engine — tool allowlists, command approval gates,
secret redaction, path traversal protection, and data privacy controls.

Privacy tiers:
  - standard  : All 5 providers available
  - sensitive  : Disables DeepSeek and Kimi (non-transparent data policies)
  - strict     : Only Anthropic (best data policy, no training on API data)
"""
import os
import re
from dataclasses import dataclass, field
from typing import Optional, Set


# Commands that always require human approval
DESTRUCTIVE_COMMANDS = {
    "rm", "rmdir", "del", "delete", "drop", "truncate",
    "git push", "git push --force", "git reset --hard",
    "npm publish", "pip publish", "docker push",
    "kubectl delete", "terraform destroy", "terraform apply",
    "chmod 777", "chown", "sudo",
    "ALTER TABLE", "DROP TABLE", "DROP DATABASE",
    "format", "mkfs", "dd",  # disk-level destructive ops
}

# Patterns for secrets/PII that must never be sent to any model
SECRET_PATTERNS = [
    # Generic key/secret/password patterns
    re.compile(r"(?i)(api[_-]?key|secret[_-]?key|private[_-]?key|password|passwd|token|credential|auth)[=:\s\"']+[A-Za-z0-9\-_\.\/+]{8,}"),
    # OpenAI keys (sk- and sk-proj-)
    re.compile(r"sk-[a-zA-Z0-9\-_]{20,}"),
    # Anthropic keys
    re.compile(r"sk-ant-[a-zA-Z0-9\-]{20,}"),
    # Google API keys
    re.compile(r"AIza[0-9A-Za-z\-_]{35}"),
    # Bearer tokens
    re.compile(r"(?i)bearer\s+[a-zA-Z0-9\-_\.=]+"),
    # AWS keys
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"(?i)aws[_\-]?(secret[_\-]?access[_\-]?key|session[_\-]?token)[=:\s\"']+\S+"),
    # GitHub tokens
    re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}"),
    # Connection strings / DSNs
    re.compile(r"(?i)(mongodb|postgres|mysql|redis|amqp|jdbc)[+a-z]*://[^\s\"'<>]+"),
]

# Path traversal patterns
PATH_TRAVERSAL = re.compile(r"\.\.[/\\]")

# Privacy tier definitions — controls which providers are allowed
PRIVACY_TIERS = {
    "standard": {
        "description": "All providers available",
        "blocked_providers": [],
    },
    "sensitive": {
        "description": "Blocks providers with less transparent data policies (DeepSeek, Kimi)",
        "blocked_providers": ["deepseek", "kimi"],
    },
    "strict": {
        "description": "Only Anthropic — best documented data policy, no API training",
        "blocked_providers": ["openai", "gemini", "deepseek", "kimi"],
    },
}


def _load_privacy_tier() -> str:
    """Read privacy tier from environment variable. Defaults to 'standard'."""
    tier = os.getenv("PRIVACY_TIER", "standard").lower()
    if tier not in PRIVACY_TIERS:
        tier = "standard"
    return tier


@dataclass
class SecurityPolicy:
    allowed_tools: list[str] = field(default_factory=lambda: [
        "read_file", "write_file", "list_directory", "search_code",
        "run_tests", "lint", "format",
        # Developer MCP tools
        "code_lint", "json_validate", "regex_test", "hash_text",
        "base64_encode", "uuid_generate", "timestamp",
        "url_parse", "diff_text", "estimate_tokens",
        "web_search",
    ])
    # Commands that require explicit approval before execution
    approval_required_commands: list[str] = field(default_factory=lambda: list(DESTRUCTIVE_COMMANDS))
    read_only_mode: bool = False
    max_file_size_bytes: int = 10 * 1024 * 1024  # 10MB
    execution_timeout_seconds: int = 30
    allow_network_access: bool = True
    working_directory_restriction: str = "/tmp/cortex_work"
    # Privacy tier: "standard" | "sensitive" | "strict"
    privacy_tier: str = field(default_factory=_load_privacy_tier)


class SecurityEngine:
    def __init__(self, policy: Optional[SecurityPolicy] = None):
        self.policy = policy or SecurityPolicy()
        tier_info = PRIVACY_TIERS.get(self.policy.privacy_tier, PRIVACY_TIERS["standard"])
        self._blocked_providers: Set[str] = set(tier_info["blocked_providers"])

    @property
    def privacy_tier(self) -> str:
        return self.policy.privacy_tier

    @property
    def blocked_providers(self) -> list[str]:
        return list(self._blocked_providers)

    def is_provider_allowed(self, provider_id: str) -> tuple[bool, str]:
        """Check if a provider is allowed under the current privacy tier."""
        if provider_id in self._blocked_providers:
            tier_info = PRIVACY_TIERS[self.policy.privacy_tier]
            return False, (
                f"Provider '{provider_id}' is blocked under privacy tier "
                f"'{self.policy.privacy_tier}': {tier_info['description']}"
            )
        return True, "ok"

    def filter_providers(self, provider_ids: list[str]) -> list[str]:
        """Return only allowed providers from a list."""
        return [p for p in provider_ids if p not in self._blocked_providers]

    def redact_secrets(self, text: str) -> str:
        """Remove secret values and PII from text before sending to any model."""
        for pattern in SECRET_PATTERNS:
            text = pattern.sub("[REDACTED]", text)
        return text

    def check_tool_allowed(self, tool_id: str) -> tuple[bool, str]:
        if tool_id not in self.policy.allowed_tools:
            return False, f"Tool '{tool_id}' not in allowlist"
        return True, "ok"

    def check_command(self, command: str) -> tuple[bool, bool, str]:
        """Returns (is_safe, requires_approval, reason)."""
        cmd_lower = command.lower().strip()

        if PATH_TRAVERSAL.search(command):
            return False, False, "Path traversal detected"

        if self.policy.read_only_mode:
            write_ops = ["write", "create", "delete", "modify", "rm ", "mv ", "cp "]
            if any(op in cmd_lower for op in write_ops):
                return False, False, "Read-only mode: write operations not allowed"

        for destructive in self.policy.approval_required_commands:
            if destructive.lower() in cmd_lower:
                return True, True, f"Destructive command '{destructive}' requires approval"

        return True, False, "ok"

    def check_file_path(self, path: str) -> tuple[bool, str]:
        if PATH_TRAVERSAL.search(path):
            return False, "Path traversal not allowed"
        # Resolve both paths to prevent partial-prefix bypass (e.g. /tmp/cortex_work2)
        restriction = self.policy.working_directory_restriction
        if restriction:
            import os as _os
            try:
                abs_path = _os.path.realpath(_os.path.abspath(path))
                abs_restriction = _os.path.realpath(_os.path.abspath(restriction))
                if not abs_path.startswith(abs_restriction + _os.sep) and abs_path != abs_restriction:
                    return False, f"Path outside working directory {restriction}"
            except Exception:
                pass
        return True, "ok"

    def validate_prompt(self, text: str) -> str:
        """Redact secrets and PII from prompt before sending to any model."""
        return self.redact_secrets(text)

    def get_privacy_summary(self) -> dict:
        """Return a summary of the current privacy configuration."""
        tier_info = PRIVACY_TIERS[self.policy.privacy_tier]
        return {
            "tier": self.policy.privacy_tier,
            "description": tier_info["description"],
            "blocked_providers": list(self._blocked_providers),
            "allowed_providers": [p for p in ["openai", "anthropic", "gemini", "deepseek", "kimi"]
                                   if p not in self._blocked_providers],
        }
