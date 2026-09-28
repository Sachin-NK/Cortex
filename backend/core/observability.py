from __future__ import annotations
import uuid
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

logger = logging.getLogger("cortex.trace")


@dataclass
class TraceEvent:
    event_type: str  # request | classification | routing | llm_call | tool_call | validation | approval | error | complete
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    workflow_id: str = ""
    task_id: str = ""
    agent: str = ""
    provider: str = ""
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    status: str = "ok"  # ok | error | skipped | pending_approval
    message: str = ""
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Serialise the event to a plain dict for JSON logging."""
        return {
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "workflow_id": self.workflow_id,
            "task_id": self.task_id,
            "agent": self.agent,
            "provider": self.provider,
            "model": self.model,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd": self.cost_usd,
            "latency_ms": self.latency_ms,
            "status": self.status,
            "message": self.message,
            "metadata": self.metadata,
        }


@dataclass
class ExecutionTrace:
    trace_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str = ""
    user_request: str = ""
    started_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    completed_at: Optional[str] = None
    events: list[TraceEvent] = field(default_factory=list)
    final_status: str = "running"

    def add_event(self, event: TraceEvent) -> None:
        self.events.append(event)
        safe_msg = event.message[:200] if event.message else ""
        logger.info(
            f"[{event.event_type}] trace={self.trace_id[:8]} "
            f"provider={event.provider or '-'} model={event.model or '-'} "
            f"status={event.status} tokens={event.input_tokens + event.output_tokens} "
            f"cost=${event.cost_usd:.6f} msg={safe_msg}"
        )

    def complete(self, status: str = "completed") -> None:
        self.completed_at = datetime.utcnow().isoformat()
        self.final_status = status

    def to_dict(self) -> dict:
        return {
            "trace_id": self.trace_id,
            "workflow_id": self.workflow_id,
            "user_request": self.user_request[:500],
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "final_status": self.final_status,
            "total_events": len(self.events),
            "total_cost_usd": round(sum(e.cost_usd for e in self.events), 6),
            "total_tokens": sum(e.input_tokens + e.output_tokens for e in self.events),
            "events": [
                {
                    "event_type": e.event_type,
                    "timestamp": e.timestamp,
                    "agent": e.agent,
                    "provider": e.provider,
                    "model": e.model,
                    "input_tokens": e.input_tokens,
                    "output_tokens": e.output_tokens,
                    "cost_usd": e.cost_usd,
                    "latency_ms": e.latency_ms,
                    "status": e.status,
                    "message": e.message[:300] if e.message else "",
                }
                for e in self.events
            ],
        }


class TraceStore:
    def __init__(self):
        self._traces: dict[str, ExecutionTrace] = {}

    def create(self, workflow_id: str, user_request: str) -> ExecutionTrace:
        trace = ExecutionTrace(workflow_id=workflow_id, user_request=user_request)
        self._traces[trace.trace_id] = trace
        return trace

    def get(self, trace_id: str) -> Optional[ExecutionTrace]:
        return self._traces.get(trace_id)

    def list(self) -> list[dict]:
        return sorted(
            [t.to_dict() for t in self._traces.values()],
            key=lambda t: t["started_at"],
            reverse=True,
        )
