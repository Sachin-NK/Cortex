from __future__ import annotations
"""
Circuit Breaker + Exponential Backoff for provider reliability.
"""
import asyncio
import time
import logging
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"       # Normal operation
    OPEN = "open"           # Failing — reject calls
    HALF_OPEN = "half_open" # Testing recovery


@dataclass
class CircuitBreaker:
    provider_id: str
    failure_threshold: int = 3
    recovery_timeout: float = 30.0  # seconds
    success_threshold: int = 2      # successes needed in HALF_OPEN to close

    _state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    _failure_count: int = field(default=0, init=False)
    _success_count: int = field(default=0, init=False)
    _opened_at: float = field(default=0.0, init=False)

    @property
    def state(self) -> CircuitState:
        """Return current circuit state, auto-transitioning OPEN -> HALF_OPEN after timeout."""
        if self._state == CircuitState.OPEN:
            if time.time() - self._opened_at >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                self._success_count = 0
                logger.info(f"Circuit {self.provider_id}: OPEN -> HALF_OPEN")
        return self._state

    def allow_request(self) -> bool:
        return self.state != CircuitState.OPEN

    def record_success(self) -> None:
        if self._state == CircuitState.HALF_OPEN:
            self._success_count += 1
            if self._success_count >= self.success_threshold:
                self._state = CircuitState.CLOSED
                self._failure_count = 0
                logger.info(f"Circuit {self.provider_id}: HALF_OPEN → CLOSED")
        else:
            self._failure_count = max(0, self._failure_count - 1)

    def record_failure(self) -> None:
        self._failure_count += 1
        if self._failure_count >= self.failure_threshold:
            if self._state != CircuitState.OPEN:
                self._state = CircuitState.OPEN
                self._opened_at = time.time()
                logger.warning(f"Circuit {self.provider_id}: → OPEN after {self._failure_count} failures")


async def with_retry(
    fn,
    provider_id: str,
    circuit: CircuitBreaker,
    max_retries: int = 3,
    base_delay: float = 1.0,
):
    """Execute fn with exponential backoff and circuit-breaker integration."""
    if not circuit.allow_request():
        raise RuntimeError(f"Circuit breaker OPEN for provider '{provider_id}' — skipping")

    last_exc = None
    for attempt in range(max_retries):
        try:
            result = await fn()
            circuit.record_success()
            return result
        except Exception as e:
            last_exc = e
            circuit.record_failure()
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Provider {provider_id} attempt {attempt+1} failed: {e}. Retrying in {delay}s")
                await asyncio.sleep(delay)

    raise last_exc
