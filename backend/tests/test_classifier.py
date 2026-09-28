from __future__ import annotations
import pytest
from core.classifier import TaskClassifier, TaskType, Complexity


@pytest.fixture
def clf():
    return TaskClassifier()


def msgs(text: str) -> list[dict]:
    return [{"role": "user", "content": text}]


def test_code_generation(clf):
    r = clf.classify(msgs("write code for a REST API endpoint"))
    assert r.task_type == TaskType.CODE_GENERATION
    assert r.requires_code is True


def test_debugging(clf):
    r = clf.classify(msgs("debug this error: AttributeError on line 42"))
    assert r.task_type == TaskType.DEBUGGING


def test_security(clf):
    r = clf.classify(msgs("do a security audit of this code"))
    assert r.task_type == TaskType.SECURITY_REVIEW
    assert r.security_sensitive is True


def test_vision(clf):
    r = clf.classify([{"role": "user", "content": [{"type": "image_url", "image_url": "..."}]}])
    assert r.requires_vision is True


def test_complexity_critical(clf):
    r = clf.classify(msgs("update the production auth system and payment flow"))
    assert r.complexity == Complexity.CRITICAL


def test_complexity_low(clf):
    r = clf.classify(msgs("fix a simple typo in readme"))
    assert r.complexity == Complexity.LOW


def test_output_format_json(clf):
    r = clf.classify(msgs("extract structured json from this document"))
    assert r.preferred_output_format == "json"


def test_general_fallback(clf):
    r = clf.classify(msgs("hello how are you"))
    assert r.task_type == TaskType.GENERAL
