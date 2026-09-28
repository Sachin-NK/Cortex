from __future__ import annotations
"""
Per-user API key and provider configuration store.
"""
import os
import json
import sqlite3
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict
from pathlib import Path

def _default_db_path() -> str:
    """Use /tmp on Vercel (read-only home), configurable via env var."""
    env = os.getenv("CORTEX_STATE_DB", "")
    if env:
        return env
    if os.getenv("VERCEL") or not os.access(str(Path.home()), os.W_OK):
        return "/tmp/cortex_state.db"
    return str(Path.home() / "AppData" / "Local" / "Temp" / "cortex_state.db")

_DB_PATH = _default_db_path()

KNOWN_PROVIDERS = [
    {"id": "openai",     "name": "OpenAI",          "env_key": "OPENAI_API_KEY",     "models": ["gpt-4o", "gpt-4o-mini", "o1", "o3"], "docs": "https://platform.openai.com/api-keys"},
    {"id": "anthropic",  "name": "Anthropic (Claude)", "env_key": "ANTHROPIC_API_KEY","models": ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"], "docs": "https://console.anthropic.com/keys"},
    {"id": "gemini",     "name": "Google Gemini",    "env_key": "GEMINI_API_KEY",     "models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"], "docs": "https://aistudio.google.com/app/apikey"},
    {"id": "deepseek",   "name": "DeepSeek",         "env_key": "DEEPSEEK_API_KEY",   "models": ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"], "docs": "https://platform.deepseek.com/api_keys"},
    {"id": "kimi",       "name": "Kimi (Moonshot)",  "env_key": "KIMI_API_KEY",       "models": ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"], "docs": "https://platform.moonshot.cn/console/api-keys"},
    {"id": "openrouter", "name": "OpenRouter",       "env_key": "OPENROUTER_API_KEY", "models": ["openai/gpt-4o", "anthropic/claude-opus-4-5", "deepseek/deepseek-chat", "google/gemini-1.5-pro", "meta-llama/llama-3.1-70b-instruct"], "docs": "https://openrouter.ai/keys"},
]


@dataclass
class ProviderConfig:
    provider_id: str
    enabled: bool = True
    api_key: str = ""             # user-supplied key (overrides .env)
    default_model: str = ""
    max_tokens_per_call: int = 0   # 0 = unlimited

    def has_api_key(self) -> bool:
        """Return True if an API key has been configured for this provider."""
        return bool(self.api_key and self.api_key.strip())
    max_cost_per_day_usd: float = 0.0  # 0 = unlimited
    monthly_budget_usd: float = 0.0    # 0 = unlimited
    allowed_task_types: List[str] = field(default_factory=list)
    blocked_task_types: List[str] = field(default_factory=list)
    notes: str = ""
    updated_at: float = field(default_factory=time.time)


class UserConfigStore:
    """Persist per-user provider configuration to SQLite."""

    def __init__(self, db_path: str = _DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS provider_configs (
                        provider_id TEXT PRIMARY KEY,
                        data        TEXT NOT NULL,
                        updated_at  REAL NOT NULL
                    )
                """)
                conn.commit()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"UserConfigStore init failed: {e}")

    def save(self, config: ProviderConfig) -> None:
        config.updated_at = time.time()
        data = {
            "enabled": config.enabled,
            "api_key": config.api_key,
            "default_model": config.default_model,
            "max_tokens_per_call": config.max_tokens_per_call,
            "max_cost_per_day_usd": config.max_cost_per_day_usd,
            "monthly_budget_usd": config.monthly_budget_usd,
            "allowed_task_types": config.allowed_task_types,
            "blocked_task_types": config.blocked_task_types,
            "notes": config.notes,
        }
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO provider_configs (provider_id, data, updated_at) VALUES (?, ?, ?)",
                    (config.provider_id, json.dumps(data), config.updated_at),
                )
                conn.commit()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"UserConfigStore save failed: {e}")

    def load(self, provider_id: str) -> Optional[ProviderConfig]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                row = conn.execute(
                    "SELECT data, updated_at FROM provider_configs WHERE provider_id=?",
                    (provider_id,),
                ).fetchone()
            if not row:
                return None
            d = json.loads(row[0])
            return ProviderConfig(
                provider_id=provider_id,
                enabled=d.get("enabled", True),
                api_key=d.get("api_key", ""),
                default_model=d.get("default_model", ""),
                max_tokens_per_call=d.get("max_tokens_per_call", 0),
                max_cost_per_day_usd=d.get("max_cost_per_day_usd", 0.0),
                monthly_budget_usd=d.get("monthly_budget_usd", 0.0),
                allowed_task_types=d.get("allowed_task_types", []),
                blocked_task_types=d.get("blocked_task_types", []),
                notes=d.get("notes", ""),
                updated_at=row[1],
            )
        except Exception:
            return None

    def load_all(self) -> Dict[str, ProviderConfig]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute("SELECT provider_id, data, updated_at FROM provider_configs").fetchall()
            result = {}
            for pid, data_str, updated_at in rows:
                d = json.loads(data_str)
                result[pid] = ProviderConfig(
                    provider_id=pid,
                    enabled=d.get("enabled", True),
                    api_key=d.get("api_key", ""),
                    default_model=d.get("default_model", ""),
                    max_tokens_per_call=d.get("max_tokens_per_call", 0),
                    max_cost_per_day_usd=d.get("max_cost_per_day_usd", 0.0),
                    monthly_budget_usd=d.get("monthly_budget_usd", 0.0),
                    allowed_task_types=d.get("allowed_task_types", []),
                    blocked_task_types=d.get("blocked_task_types", []),
                    notes=d.get("notes", ""),
                    updated_at=updated_at,
                )
            return result
        except Exception:
            return {}

    def delete(self, provider_id: str) -> bool:
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM provider_configs WHERE provider_id=?", (provider_id,))
                conn.commit()
            return True
        except Exception:
            return False

    def get_effective_key(self, provider_id: str) -> Optional[str]:
        """User-supplied key takes priority over .env key."""
        cfg = self.load(provider_id)
        if cfg and cfg.api_key:
            return cfg.api_key
        # Fall back to env var
        env_map = {p["id"]: p["env_key"] for p in KNOWN_PROVIDERS}
        env_key = env_map.get(provider_id, "")
        return os.getenv(env_key) if env_key else None

    def is_provider_enabled(self, provider_id: str) -> bool:
        cfg = self.load(provider_id)
        return cfg.enabled if cfg else True

    def check_limits(self, provider_id: str, task_type: str, estimated_tokens: int) -> tuple[bool, str]:
        """Returns (allowed, reason). Check before routing."""
        cfg = self.load(provider_id)
        if not cfg:
            return True, "ok"
        if not cfg.enabled:
            return False, f"Provider '{provider_id}' is disabled by user"
        if cfg.blocked_task_types and task_type in cfg.blocked_task_types:
            return False, f"Task type '{task_type}' is blocked for provider '{provider_id}'"
        if cfg.allowed_task_types and task_type not in cfg.allowed_task_types:
            return False, f"Task type '{task_type}' not in allowed list for provider '{provider_id}'"
        if cfg.max_tokens_per_call > 0 and estimated_tokens > cfg.max_tokens_per_call:
            return False, f"Request tokens {estimated_tokens} exceeds limit {cfg.max_tokens_per_call} for '{provider_id}'"
        return True, "ok"
