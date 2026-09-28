"""Memory subsystem tests."""
import pytest
from core.memory import MemoryStore, MemoryScope, Message


@pytest.fixture
def store():
    return MemoryStore()


def test_create_and_get_session(store):
    s = store.create_session()
    assert s.id
    assert store.get_session(s.id) is not None


def test_add_and_retrieve_messages(store):
    s = store.create_session()
    store.add_message(s.id, Message(role="user", content="hello", tokens=5, cost_usd=0.001))
    store.add_message(s.id, Message(role="assistant", content="hi", tokens=3, cost_usd=0.0))
    msgs = store.get_messages_for_llm(s.id)
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"


def test_session_stats(store):
    s = store.create_session()
    store.add_message(s.id, Message(role="user", content="test", tokens=10, cost_usd=0.005, provider="openai"))
    stats = store.get_stats(s.id)
    assert stats["message_count"] == 1
    assert stats["total_tokens"] == 10
    assert "openai" in stats["providers_used"]


def test_delete_session(store):
    s = store.create_session()
    assert store.delete_session(s.id) is True
    assert store.get_session(s.id) is None


def test_remember_and_recall(store):
    store.remember("db_url", "postgres://localhost/db", scope=MemoryScope.PROJECT, provenance="architect")
    val = store.recall("db_url", scope=MemoryScope.PROJECT)
    assert val == "postgres://localhost/db"


def test_assumption_not_recalled_as_fact(store):
    store.remember("guess", "maybe postgres", scope=MemoryScope.PROJECT, is_assumption=True)
    val = store.recall("guess", scope=MemoryScope.PROJECT, include_assumptions=False)
    assert val is None


def test_ttl_expiry(store):
    from datetime import datetime, timedelta
    # Store an entry with a past expiry by writing expires_at directly
    e = store.remember("temp", "short_lived", scope=MemoryScope.WORKFLOW)
    # Manually backdate the expiry so it's already expired
    e.expires_at = (datetime.utcnow() - timedelta(seconds=1)).isoformat()
    val = store.recall("temp", scope=MemoryScope.WORKFLOW)
    assert val is None


def test_list_entries(store):
    store.remember("k1", "v1", scope=MemoryScope.LONG_TERM)
    store.remember("k2", "v2", scope=MemoryScope.LONG_TERM)
    entries = store.list_entries(MemoryScope.LONG_TERM)
    keys = [e.key for e in entries]
    assert "k1" in keys and "k2" in keys


def test_delete_entry(store):
    e = store.remember("del_me", "yes", scope=MemoryScope.AGENT)
    assert store.delete_entry(e.id) is True
    assert store.recall("del_me", scope=MemoryScope.AGENT) is None


def test_clear_scope(store):
    store.remember("a", "1", scope=MemoryScope.WORKFLOW)
    store.remember("b", "2", scope=MemoryScope.WORKFLOW)
    count = store.clear_scope(MemoryScope.WORKFLOW)
    assert count == 2
    assert store.list_entries(MemoryScope.WORKFLOW) == []
