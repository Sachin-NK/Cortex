"""Circuit breaker and retry tests."""
import pytest
import asyncio
from ..core.circuit_breaker import CircuitBreaker, CircuitState, with_retry


def test_initial_state_closed():
    cb = CircuitBreaker(provider_id="test")
    assert cb.state == CircuitState.CLOSED
    assert cb.allow_request() is True


def test_opens_after_threshold():
    cb = CircuitBreaker(provider_id="test", failure_threshold=3)
    for _ in range(3):
        cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.allow_request() is False


def test_transitions_to_half_open_after_timeout():
    import time
    cb = CircuitBreaker(provider_id="test", failure_threshold=2, recovery_timeout=0.05)
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    time.sleep(0.1)
    # Accessing .state triggers the OPEN → HALF_OPEN transition
    assert cb.state == CircuitState.HALF_OPEN


def test_closes_after_successes_in_half_open():
    import time
    cb = CircuitBreaker(provider_id="test", failure_threshold=2, recovery_timeout=0.05, success_threshold=2)
    cb.record_failure()
    cb.record_failure()
    time.sleep(0.1)
    _ = cb.state  # trigger HALF_OPEN
    cb.record_success()
    cb.record_success()
    assert cb.state == CircuitState.CLOSED


@pytest.mark.asyncio
async def test_with_retry_success():
    cb = CircuitBreaker(provider_id="test")
    call_count = [0]

    async def fn():
        call_count[0] += 1
        return "ok"

    result = await with_retry(fn, provider_id="test", circuit=cb)
    assert result == "ok"
    assert call_count[0] == 1


@pytest.mark.asyncio
async def test_with_retry_retries_on_failure():
    cb = CircuitBreaker(provider_id="test", failure_threshold=10)
    call_count = [0]

    async def fn():
        call_count[0] += 1
        if call_count[0] < 3:
            raise ValueError("flaky")
        return "recovered"

    result = await with_retry(fn, provider_id="test", circuit=cb, max_retries=4, base_delay=0.01)
    assert result == "recovered"
    assert call_count[0] == 3


@pytest.mark.asyncio
async def test_with_retry_raises_after_max():
    cb = CircuitBreaker(provider_id="test", failure_threshold=10)

    async def fn():
        raise RuntimeError("always fails")

    with pytest.raises(RuntimeError, match="always fails"):
        await with_retry(fn, provider_id="test", circuit=cb, max_retries=2, base_delay=0.01)


@pytest.mark.asyncio
async def test_open_circuit_rejects_immediately():
    cb = CircuitBreaker(provider_id="test", failure_threshold=1)
    cb.record_failure()
    assert cb.state == CircuitState.OPEN

    with pytest.raises(RuntimeError, match="Circuit breaker OPEN"):
        await with_retry(lambda: asyncio.sleep(0), provider_id="test", circuit=cb)
