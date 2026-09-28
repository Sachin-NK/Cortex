"""Observability / trace store tests."""
import pytest
from core.observability import TraceStore, TraceEvent, ExecutionTrace


@pytest.fixture
def store():
    return TraceStore()


def test_create_trace(store):
    t = store.create(workflow_id="wf-1", user_request="Hello")
    assert t.trace_id
    assert t.workflow_id == "wf-1"
    assert t.final_status == "running"


def test_get_trace(store):
    t = store.create(workflow_id="wf-2", user_request="Test")
    retrieved = store.get(t.trace_id)
    assert retrieved is not None
    assert retrieved.trace_id == t.trace_id


def test_get_nonexistent_returns_none(store):
    assert store.get("nonexistent-id") is None


def test_add_event(store):
    t = store.create(workflow_id="wf-3", user_request="Test events")
    t.add_event(TraceEvent(
        event_type="llm_call",
        provider="deepseek",
        model="deepseek-chat",
        input_tokens=100,
        output_tokens=200,
        cost_usd=0.0001,
        latency_ms=500,
        status="ok",
    ))
    assert len(t.events) == 1


def test_complete_trace(store):
    t = store.create(workflow_id="wf-4", user_request="Complete test")
    t.complete()
    assert t.final_status == "completed"
    assert t.completed_at is not None


def test_complete_with_status(store):
    t = store.create(workflow_id="wf-5", user_request="Fail test")
    t.complete(status="failed")
    assert t.final_status == "failed"


def test_to_dict_structure(store):
    t = store.create(workflow_id="wf-6", user_request="Dict test")
    t.add_event(TraceEvent(event_type="classification", provider="", status="ok"))
    t.complete()
    d = t.to_dict()
    assert "trace_id" in d
    assert "workflow_id" in d
    assert "events" in d
    assert d["total_events"] == 1
    assert d["final_status"] == "completed"


def test_list_traces(store):
    store.create(workflow_id="list-1", user_request="A")
    store.create(workflow_id="list-2", user_request="B")
    traces = store.list()
    assert len(traces) == 2
    # Should be sorted by started_at descending
    assert isinstance(traces[0], dict)
    assert "trace_id" in traces[0]


def test_cost_and_token_aggregation(store):
    t = store.create(workflow_id="cost-wf", user_request="Cost test")
    t.add_event(TraceEvent(event_type="llm_call", input_tokens=100, output_tokens=50, cost_usd=0.01))
    t.add_event(TraceEvent(event_type="llm_call", input_tokens=200, output_tokens=100, cost_usd=0.02))
    d = t.to_dict()
    assert d["total_tokens"] == 450
    assert abs(d["total_cost_usd"] - 0.03) < 0.0001
