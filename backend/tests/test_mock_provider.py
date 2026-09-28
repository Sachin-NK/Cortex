"""Tests that run WITHOUT real API credentials - uses mock provider only."""
import pytest
import asyncio
from ..providers.mock import MockProvider
from ..providers.base import LLMRequest, ProviderStatus


@pytest.fixture
def mock():
    return MockProvider()


@pytest.mark.asyncio
async def test_complete(mock):
    req = LLMRequest(messages=[{"role": "user", "content": "write code to print hello"}])
    resp = await mock.complete(req)
    assert resp.content
    assert resp.provider == "mock"
    assert resp.input_tokens > 0
    assert resp.cost_usd == 0.0


@pytest.mark.asyncio
async def test_stream(mock):
    req = LLMRequest(messages=[{"role": "user", "content": "hello"}])
    chunks = []
    async for chunk in mock.stream(req):
        chunks.append(chunk)
    assert len(chunks) > 0


@pytest.mark.asyncio
async def test_health_check(mock):
    status = await mock.health_check()
    assert status == ProviderStatus.HEALTHY


@pytest.mark.asyncio
async def test_code_response(mock):
    req = LLMRequest(messages=[{"role": "user", "content": "implement a function"}])
    resp = await mock.complete(req)
    assert "def " in resp.content or "```" in resp.content


@pytest.mark.asyncio
async def test_multiple_calls(mock):
    req = LLMRequest(messages=[{"role": "user", "content": "test"}])
    r1 = await mock.complete(req)
    r2 = await mock.complete(req)
    assert r1.metadata["call_count"] == 1
    assert r2.metadata["call_count"] == 2
