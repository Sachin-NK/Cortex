"""Router tests — uses mock provider only."""
import pytest
from ..core.router import TaskRouter
from ..core.policies import get_policy, PolicyType
from ..core.discovery import ModelRegistry
from ..core.token_accounting import TokenAccountant
from ..providers.mock import MockProvider
from ..providers.base import LLMRequest


@pytest.fixture
def router():
    providers = {"mock": MockProvider()}
    registry = ModelRegistry()
    accountant = TokenAccountant()
    return TaskRouter(providers, registry=registry, accountant=accountant)


@pytest.mark.asyncio
async def test_route_returns_decision(router):
    policy = get_policy(PolicyType.BALANCED)
    req = LLMRequest(messages=[{"role": "user", "content": "write code"}])
    decision = await router.route(req, policy)
    assert decision.provider_id == "mock"
    assert decision.model


@pytest.mark.asyncio
async def test_execute_with_fallback(router):
    policy = get_policy(PolicyType.LOWEST_COST)
    req = LLMRequest(messages=[{"role": "user", "content": "debug this error"}])
    response, decision = await router.execute_with_fallback(req, policy)
    assert response.content
    assert response.provider == "mock"


@pytest.mark.asyncio
async def test_token_accounting(router):
    policy = get_policy(PolicyType.BALANCED)
    req = LLMRequest(messages=[{"role": "user", "content": "hello"}])
    await router.execute_with_fallback(req, policy, workflow_id="wf-1", agent="test-agent")
    report = router.accountant.get_report("wf-1")
    assert report["total_tokens"] > 0
    assert "mock" in report["by_provider"]


@pytest.mark.asyncio
async def test_no_providers_raises(router):
    router.providers = {}
    policy = get_policy(PolicyType.BALANCED)
    req = LLMRequest(messages=[{"role": "user", "content": "hello"}])
    with pytest.raises(RuntimeError):
        await router.execute_with_fallback(req, policy)
