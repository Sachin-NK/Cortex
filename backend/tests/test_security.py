import pytest
from ..core.security import SecurityEngine, SecurityPolicy


@pytest.fixture
def sec():
    return SecurityEngine()


def test_redact_api_key(sec):
    text = "use api_key=sk-abc123def456 for auth"
    result = sec.redact_secrets(text)
    assert "sk-abc123def456" not in result
    assert "[REDACTED]" in result


def test_redact_openai_key(sec):
    text = "my key is sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
    result = sec.redact_secrets(text)
    assert "sk-proj" not in result


def test_tool_allowlist(sec):
    ok, _ = sec.check_tool_allowed("read_file")
    assert ok is True
    fail, msg = sec.check_tool_allowed("evil_tool")
    assert fail is False
    assert "allowlist" in msg


def test_destructive_command_requires_approval(sec):
    safe, approval, msg = sec.check_command("rm -rf /tmp/test")
    assert safe is True
    assert approval is True


def test_path_traversal_blocked(sec):
    safe, _, msg = sec.check_command("cat ../../etc/passwd")
    assert safe is False
    assert "traversal" in msg.lower()


def test_path_check(sec):
    ok, _ = sec.check_file_path("/tmp/cortex_work/output.txt")
    assert ok is True


def test_read_only_blocks_writes():
    sec = SecurityEngine(SecurityPolicy(read_only_mode=True))
    safe, _, _ = sec.check_command("write output.txt")
    assert safe is False


def test_validate_prompt_redacts(sec):
    prompt = "call with token=sk-abc123 please"
    result = sec.validate_prompt(prompt)
    assert "sk-abc123" not in result
