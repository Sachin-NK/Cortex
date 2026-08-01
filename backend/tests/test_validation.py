import pytest
from ..core.validation import OutputValidator


@pytest.fixture
def v():
    return OutputValidator()


def test_valid_json(v):
    result = v.validate_json('{"key": "value", "count": 42}')
    assert result.valid is True
    assert result.data["key"] == "value"


def test_json_from_markdown(v):
    text = '```json\n{"status": "ok"}\n```'
    result = v.validate_json(text)
    assert result.valid is True
    assert result.data["status"] == "ok"


def test_invalid_json(v):
    result = v.validate_json("not json at all {bad")
    assert result.valid is False
    assert result.errors


def test_valid_python_code(v):
    text = "```python\ndef hello():\n    return 'world'\n```"
    result = v.validate_code(text, "python")
    assert result.valid is True
    assert "def hello" in result.data


def test_syntax_error_code(v):
    text = "```python\ndef bad(\n    return 'unclosed'\n```"
    result = v.validate_code(text, "python")
    assert result.valid is False


def test_not_empty_pass(v):
    result = v.validate_not_empty("This is a valid response with enough content")
    assert result.valid is True


def test_not_empty_fail(v):
    result = v.validate_not_empty("hi")
    assert result.valid is False


def test_no_secrets_clean(v):
    result = v.validate_no_secrets("Here is a normal response without secrets")
    assert result.valid is True


def test_no_secrets_detects_key(v):
    result = v.validate_no_secrets("use api_key=sk-abc123456789 to authenticate")
    assert result.valid is False
