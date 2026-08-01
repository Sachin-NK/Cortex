from __future__ import annotations
"""
Memory subsystem with separate scopes:
  - workflow   : scoped to a single workflow run
  - project    : persists across workflows for the same project
  - agent      : agent-local working memory
  - long_term  : approved persistent memory
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional
import uuid


class MemoryScope(str, Enum):
    WORKFLOW = "workflow"
    PROJECT = "project"
    AGENT = "agent"
    LONG_TERM = "long_term"


@dataclass
class MemoryEntry:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    scope: MemoryScope = MemoryScope.WORKFLOW
    key: str = ""
    value: str = ""
    provenance: str = ""       # which agent/model wrote this
    is_assumption: bool = False  # agent assumptions ≠ facts
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    expires_at: Optional[str] = None
    metadata: dict = field(default_factory=dict)

    def is_expired(self) -> bool:
        if not self.expires_at:
            return False
        return datetime.utcnow() > datetime.fromisoformat(self.expires_at)


@dataclass
class Message:
    role: str   # user | assistant | system | tool
    content: str
    provider: Optional[str] = None
    model: Optional[str] = None
    tokens: int = 0
    cost_usd: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class Session:
    id: str
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    messages: list[Message] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    total_cost_usd: float = 0.0
    total_tokens: int = 0

    def add_message(self, message: Message) -> None:
        """Append a message and update running cost/token totals."""
        self.messages.append(message)
        self.total_cost_usd += message.cost_usd
        self.total_tokens += message.tokens


class MemoryStore:
    def __init__(self):
        self._sessions: dict[str, Session] = {}
        self._entries: dict[MemoryScope, list[MemoryEntry]] = {
            scope: [] for scope in MemoryScope
        }

    # ── Session management ─────────────────────────────────────────────────
    def create_session(self, metadata: Optional[dict] = None) -> Session:
        session = Session(id=str(uuid.uuid4()), metadata=metadata or {})
        self._sessions[session.id] = session
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        return self._sessions.get(session_id)

    def add_message(self, session_id: str, message: Message) -> None:
        session = self._sessions.get(session_id)
        if not session:
            raise KeyError(f"Session {session_id} not found")
        session.messages.append(message)
        session.total_tokens += message.tokens
        session.total_cost_usd += message.cost_usd

    def get_messages_for_llm(self, session_id: str, max_messages: int = 20) -> list[dict]:
        """Returns last N messages formatted for LLM APIs (retrieval not full history)."""
        session = self._sessions.get(session_id)
        if not session:
            return []
        msgs = session.messages[-max_messages:]
        return [{"role": m.role, "content": m.content} for m in msgs if m.role in ("user", "assistant", "system")]

    def list_sessions(self) -> list[Session]:
        return list(self._sessions.values())

    def delete_session(self, session_id: str) -> bool:
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False

    def get_stats(self, session_id: str) -> dict:
        session = self._sessions.get(session_id)
        if not session:
            return {}
        return {
            "message_count": len(session.messages),
            "total_tokens": session.total_tokens,
            "total_cost_usd": round(session.total_cost_usd, 6),
            "providers_used": list({m.provider for m in session.messages if m.provider}),
        }

    # ── Scoped memory ──────────────────────────────────────────────────────
    def remember(
        self,
        key: str,
        value: str,
        scope: MemoryScope = MemoryScope.WORKFLOW,
        provenance: str = "",
        is_assumption: bool = False,
        ttl_seconds: Optional[int] = None,
    ) -> MemoryEntry:
        """Store a memory entry. Assumptions are flagged and not treated as facts."""
        expires_at = None
        if ttl_seconds:
            expires_at = (datetime.utcnow() + timedelta(seconds=ttl_seconds)).isoformat()

        entry = MemoryEntry(
            scope=scope, key=key, value=value,
            provenance=provenance, is_assumption=is_assumption,
            expires_at=expires_at,
        )
        self._entries[scope].append(entry)
        return entry

    def recall(
        self,
        key: str,
        scope: MemoryScope = MemoryScope.WORKFLOW,
        include_assumptions: bool = False,
    ) -> Optional[str]:
        """Retrieve latest non-expired entry for a key in a scope."""
        entries = [
            e for e in reversed(self._entries[scope])
            if e.key == key and not e.is_expired()
            and (include_assumptions or not e.is_assumption)
        ]
        return entries[0].value if entries else None

    def list_entries(self, scope: MemoryScope) -> list[MemoryEntry]:
        return [e for e in self._entries[scope] if not e.is_expired()]

    def delete_entry(self, entry_id: str) -> bool:
        for entries in self._entries.values():
            for e in entries:
                if e.id == entry_id:
                    entries.remove(e)
                    return True
        return False

    def clear_scope(self, scope: MemoryScope) -> int:
        count = len(self._entries[scope])
        self._entries[scope] = []
        return count
