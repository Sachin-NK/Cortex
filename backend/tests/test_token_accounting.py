import pytest
from core.token_accounting import TokenAccountant, UsageRecord, ClaudeBudgetPolicy


@pytest.fixture
def acct():
    policy = ClaudeBudgetPolicy(
        enabled=True,
        maximum_calls_per_workflow=2,
        maximum_input_tokens_per_call=5000,
        allowed_tasks=["final_verification", "critical_security_review"],
    )
    return TokenAccountant(claude_budget=policy)


def test_record_and_report(acct):
    acct.record(UsageRecord(provider="deepseek", model="deepseek-chat", agent="developer",
                            workflow_id="wf1", task_type="code_generation",
                            input_tokens=100, output_tokens=200, cost_usd=0.001))
    report = acct.get_report("wf1")
    assert report["total_tokens"] == 300
    assert "deepseek" in report["by_provider"]


def test_claude_budget_allowed(acct):
    allowed, reason = acct.check_claude_allowed("wf1", "final_verification", 1000)
    assert allowed is True


def test_claude_blocked_wrong_task(acct):
    allowed, reason = acct.check_claude_allowed("wf1", "code_generation", 1000)
    assert allowed is False
    assert "not in Claude allowed list" in reason


def test_claude_budget_exhausted(acct):
    for _ in range(2):
        acct.record(UsageRecord(provider="anthropic", model="claude-opus-4-5",
                                workflow_id="wf2", input_tokens=100, output_tokens=50))
    allowed, reason = acct.check_claude_allowed("wf2", "final_verification", 100)
    assert allowed is False
    assert "budget exhausted" in reason


def test_claude_token_limit(acct):
    allowed, reason = acct.check_claude_allowed("wf1", "final_verification", 99999)
    assert allowed is False
    assert "exceeds" in reason


def test_claude_efficiency_report(acct):
    acct.record(UsageRecord(provider="deepseek", input_tokens=1000, output_tokens=500, cost_usd=0.001, workflow_id="wf3"))
    acct.record(UsageRecord(provider="anthropic", input_tokens=200, output_tokens=100, cost_usd=0.01, workflow_id="wf3"))
    report = acct.get_report("wf3")
    eff = report["claude_efficiency"]
    assert eff["calls"] == 1
    total = 1000 + 500 + 200 + 100
    assert report["total_tokens"] == total
    assert eff["percentage_of_total"] < 30  # claude is minority
