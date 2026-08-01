from __future__ import annotations
"""
MCP Tool Orchestrator — developer-focused tools that integrate with
real APIs and utilities useful in an AI coding assistant context.

Built-in tools:
  - code_lint       : Lint Python code using pyflakes
  - code_format     : Format Python code using black style rules
  - regex_test      : Test a regex pattern against input strings
  - json_validate   : Validate and pretty-print JSON
  - hash_text       : Hash text with common algorithms (md5, sha256, etc.)
  - base64_encode   : Encode/decode base64
  - uuid_generate   : Generate UUIDs
  - timestamp       : Get current UTC timestamp in various formats
  - url_parse       : Parse and decompose a URL into its components
  - diff_text       : Compute unified diff between two text blocks
  - estimate_tokens : Estimate token count for a given model
  - web_search      : Google web search via Serper API
"""
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, Optional
import asyncio
import os
import logging

logger = logging.getLogger(__name__)


@dataclass
class MCPTool:
    id: str
    name: str
    description: str
    input_schema: dict          # JSON Schema for parameters
    handler: Callable[..., Awaitable[Any]]   # async function


@dataclass
class MCPToolResult:
    tool_id: str
    success: bool
    output: Any
    error: Optional[str] = None


class MCPOrchestrator:
    def __init__(self):
        self._tools: dict[str, MCPTool] = {}
        self._register_builtin_tools()

    def _register_builtin_tools(self):
        """Register developer-focused built-in tools."""

        # ── Code lint (pyflakes-style checks) ────────────────────────────
        async def code_lint(code: str, language: str = "python") -> dict:
            if language != "python":
                return {"language": language, "issues": [], "note": f"Linting not supported for {language} yet"}
            issues = []
            import ast
            try:
                tree = ast.parse(code)
                # Check for common issues
                for node in ast.walk(tree):
                    # Unused import detection (basic)
                    if isinstance(node, (ast.Import, ast.ImportFrom)):
                        pass  # Would need full scope analysis for real unused detection
                    # Bare except
                    if isinstance(node, ast.ExceptHandler) and node.type is None:
                        issues.append({"line": node.lineno, "message": "bare `except:` clause — catch specific exceptions", "severity": "warning"})
                    # Dangerous eval/exec
                    if isinstance(node, ast.Call):
                        func = node.func
                        if isinstance(func, ast.Name) and func.id in ("eval", "exec"):
                            issues.append({"line": node.lineno, "message": f"`{func.id}()` is a security risk — avoid dynamic code execution", "severity": "error"})
            except SyntaxError as e:
                issues.append({"line": e.lineno, "message": f"SyntaxError: {e.msg}", "severity": "error"})
            return {
                "language": language,
                "issues": issues,
                "issue_count": len(issues),
                "status": "pass" if not issues else "fail",
            }

        # ── JSON validate & pretty-print ──────────────────────────────────
        async def json_validate(text: str) -> dict:
            import json
            try:
                parsed = json.loads(text)
                pretty = json.dumps(parsed, indent=2, ensure_ascii=False)
                return {"valid": True, "pretty": pretty, "type": type(parsed).__name__}
            except json.JSONDecodeError as e:
                return {"valid": False, "error": str(e), "pretty": None}

        # ── Regex tester ──────────────────────────────────────────────────
        async def regex_test(pattern: str, test_string: str, flags: str = "") -> dict:
            import re
            flag_map = {"i": re.IGNORECASE, "m": re.MULTILINE, "s": re.DOTALL}
            combined = 0
            for f in flags.lower():
                combined |= flag_map.get(f, 0)
            try:
                compiled = re.compile(pattern, combined)
                matches = list(compiled.finditer(test_string))
                return {
                    "pattern": pattern,
                    "matches": [{"match": m.group(), "start": m.start(), "end": m.end(), "groups": list(m.groups())} for m in matches],
                    "match_count": len(matches),
                    "full_match": bool(compiled.fullmatch(test_string)),
                }
            except re.error as e:
                return {"error": f"Invalid regex: {e}", "matches": []}

        # ── Hash text ─────────────────────────────────────────────────────
        async def hash_text(text: str, algorithm: str = "sha256") -> dict:
            import hashlib
            algo = algorithm.lower().replace("-", "")
            try:
                h = hashlib.new(algo, text.encode("utf-8"))
                return {"algorithm": algorithm, "input": text[:50] + "..." if len(text) > 50 else text, "hash": h.hexdigest()}
            except ValueError:
                supported = ["md5", "sha1", "sha256", "sha512", "sha3_256"]
                return {"error": f"Unknown algorithm '{algorithm}'", "supported": supported}

        # ── Base64 encode/decode ──────────────────────────────────────────
        async def base64_encode(text: str, operation: str = "encode") -> dict:
            import base64
            try:
                if operation == "encode":
                    result = base64.b64encode(text.encode("utf-8")).decode("ascii")
                else:
                    result = base64.b64decode(text.encode("ascii")).decode("utf-8")
                return {"operation": operation, "input": text[:50] + "..." if len(text) > 50 else text, "result": result}
            except Exception as e:
                return {"error": str(e)}

        # ── UUID generator ────────────────────────────────────────────────
        async def uuid_generate(version: int = 4, count: int = 1) -> dict:
            import uuid as _uuid
            generators = {1: _uuid.uuid1, 4: _uuid.uuid4}
            if version not in generators:
                return {"error": f"Version {version} not supported. Use 1 or 4."}
            count = min(count, 20)  # cap at 20
            uuids = [str(generators[version]()) for _ in range(count)]
            return {"version": version, "count": count, "uuids": uuids}

        # ── Timestamp ─────────────────────────────────────────────────────
        async def timestamp(format: str = "iso") -> dict:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            formats = {
                "iso":   now.isoformat(),
                "unix":  int(now.timestamp()),
                "unix_ms": int(now.timestamp() * 1000),
                "date":  now.strftime("%Y-%m-%d"),
                "time":  now.strftime("%H:%M:%S"),
                "rfc":   now.strftime("%a, %d %b %Y %H:%M:%S GMT"),
            }
            if format == "all":
                return formats
            return {"format": format, "value": formats.get(format, now.isoformat())}

        # ── URL parser ────────────────────────────────────────────────────
        async def url_parse(url: str) -> dict:
            from urllib.parse import urlparse, parse_qs
            try:
                p = urlparse(url)
                return {
                    "scheme": p.scheme,
                    "host": p.hostname,
                    "port": p.port,
                    "path": p.path,
                    "query_params": parse_qs(p.query),
                    "fragment": p.fragment,
                    "is_secure": p.scheme in ("https", "wss"),
                }
            except Exception as e:
                return {"error": str(e)}

        # ── Text diff ─────────────────────────────────────────────────────
        async def diff_text(original: str, modified: str, context_lines: int = 3) -> dict:
            import difflib
            diff = list(difflib.unified_diff(
                original.splitlines(keepends=True),
                modified.splitlines(keepends=True),
                fromfile="original",
                tofile="modified",
                n=context_lines,
            ))
            added = sum(1 for l in diff if l.startswith("+") and not l.startswith("+++"))
            removed = sum(1 for l in diff if l.startswith("-") and not l.startswith("---"))
            return {
                "diff": "".join(diff),
                "lines_added": added,
                "lines_removed": removed,
                "changed": bool(diff),
            }

        # ── Token estimator ───────────────────────────────────────────────
        async def estimate_tokens(text: str, model: str = "gpt-4") -> dict:
            # Rough estimate: ~4 chars per token for English text
            char_count = len(text)
            word_count = len(text.split())
            estimated_tokens = char_count // 4
            context_limits = {
                "gpt-4o": 128000, "gpt-4o-mini": 128000,
                "claude-opus-4-5": 200000, "claude-haiku-3-5": 200000,
                "gemini-1.5-pro": 1000000, "gemini-1.5-flash": 1000000,
                "deepseek-chat": 64000, "moonshot-v1-128k": 128000,
            }
            limit = context_limits.get(model, 128000)
            return {
                "model": model,
                "estimated_tokens": estimated_tokens,
                "char_count": char_count,
                "word_count": word_count,
                "context_limit": limit,
                "fits_in_context": estimated_tokens < limit,
                "percentage_used": round(estimated_tokens / limit * 100, 1),
            }

        # ── Web search (Serper — Google Search API) ───────────────────────
        async def web_search(query: str, num_results: int = 5) -> dict:
            api_key = os.getenv("SERPER_API_KEY")
            if not api_key:
                return {"error": "SERPER_API_KEY not configured in .env", "results": []}

            import httpx
            headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
            payload = {"q": query, "num": min(num_results, 10)}

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        "https://google.serper.dev/search",
                        json=payload,
                        headers=headers,
                    )
                    resp.raise_for_status()
                    data = resp.json()

                organic = data.get("organic", [])
                results = [
                    {
                        "position": r.get("position"),
                        "title": r.get("title"),
                        "link": r.get("link"),
                        "snippet": r.get("snippet"),
                        "date": r.get("date"),
                    }
                    for r in organic[:num_results]
                ]

                answer_box = data.get("answerBox")
                knowledge_graph = data.get("knowledgeGraph")

                return {
                    "query": query,
                    "num_results": len(results),
                    "results": results,
                    **({"answer_box": answer_box} if answer_box else {}),
                    **({"knowledge_graph": knowledge_graph} if knowledge_graph else {}),
                }
            except Exception as e:
                logger.error(f"web_search error: {e}")
                return {"error": str(e), "query": query, "results": []}

        # ── Register all tools ────────────────────────────────────────────
        self.register(MCPTool(
            "code_lint", "Code Linter",
            "Lint Python code and report syntax errors, bare excepts, and dangerous patterns",
            {"type": "object", "properties": {
                "code": {"type": "string", "description": "Source code to lint"},
                "language": {"type": "string", "default": "python"},
            }, "required": ["code"]},
            code_lint,
        ))
        self.register(MCPTool(
            "json_validate", "JSON Validator",
            "Validate JSON and return a pretty-printed version",
            {"type": "object", "properties": {
                "text": {"type": "string", "description": "JSON text to validate"},
            }, "required": ["text"]},
            json_validate,
        ))
        self.register(MCPTool(
            "regex_test", "Regex Tester",
            "Test a regular expression against a string and return all matches",
            {"type": "object", "properties": {
                "pattern": {"type": "string"},
                "test_string": {"type": "string"},
                "flags": {"type": "string", "default": "", "description": "Flags: i=case-insensitive, m=multiline, s=dotall"},
            }, "required": ["pattern", "test_string"]},
            regex_test,
        ))
        self.register(MCPTool(
            "hash_text", "Hash Generator",
            "Hash text using md5, sha1, sha256, sha512, or sha3_256",
            {"type": "object", "properties": {
                "text": {"type": "string"},
                "algorithm": {"type": "string", "default": "sha256"},
            }, "required": ["text"]},
            hash_text,
        ))
        self.register(MCPTool(
            "base64_encode", "Base64 Encoder/Decoder",
            "Encode or decode a string in base64",
            {"type": "object", "properties": {
                "text": {"type": "string"},
                "operation": {"type": "string", "enum": ["encode", "decode"], "default": "encode"},
            }, "required": ["text"]},
            base64_encode,
        ))
        self.register(MCPTool(
            "uuid_generate", "UUID Generator",
            "Generate one or more UUIDs (v1 or v4)",
            {"type": "object", "properties": {
                "version": {"type": "integer", "enum": [1, 4], "default": 4},
                "count": {"type": "integer", "default": 1, "description": "How many UUIDs to generate (max 20)"},
            }},
            uuid_generate,
        ))
        self.register(MCPTool(
            "timestamp", "Timestamp",
            "Get the current UTC timestamp in iso, unix, unix_ms, date, time, rfc, or all formats",
            {"type": "object", "properties": {
                "format": {"type": "string", "default": "iso",
                           "enum": ["iso", "unix", "unix_ms", "date", "time", "rfc", "all"]},
            }},
            timestamp,
        ))
        self.register(MCPTool(
            "url_parse", "URL Parser",
            "Parse a URL into scheme, host, port, path, query params, and fragment",
            {"type": "object", "properties": {
                "url": {"type": "string"},
            }, "required": ["url"]},
            url_parse,
        ))
        self.register(MCPTool(
            "diff_text", "Text Diff",
            "Generate a unified diff between two text blocks",
            {"type": "object", "properties": {
                "original": {"type": "string"},
                "modified": {"type": "string"},
                "context_lines": {"type": "integer", "default": 3},
            }, "required": ["original", "modified"]},
            diff_text,
        ))
        self.register(MCPTool(
            "estimate_tokens", "Token Estimator",
            "Estimate how many tokens a text will use for a given model and whether it fits in context",
            {"type": "object", "properties": {
                "text": {"type": "string"},
                "model": {"type": "string", "default": "gpt-4o",
                          "description": "Model name to check context limit against"},
            }, "required": ["text"]},
            estimate_tokens,
        ))
        self.register(MCPTool(
            "web_search", "Web Search",
            "Search the web via Google (Serper API) and return top organic results with snippets",
            {"type": "object", "properties": {
                "query": {"type": "string", "description": "Search query"},
                "num_results": {"type": "integer", "default": 5, "description": "Number of results to return (max 10)"},
            }, "required": ["query"]},
            web_search,
        ))

    def register(self, tool: MCPTool) -> None:
        self._tools[tool.id] = tool

    def list_tools(self) -> list[MCPTool]:
        return list(self._tools.values())

    def get_tool_schemas(self) -> list[dict]:
        """Return tool schemas in OpenAI function-calling format."""
        return [
            {"type": "function", "function": {"name": t.id, "description": t.description, "parameters": t.input_schema}}
            for t in self._tools.values()
        ]

    async def invoke(self, tool_id: str, **kwargs) -> MCPToolResult:
        tool = self._tools.get(tool_id)
        if not tool:
            return MCPToolResult(tool_id=tool_id, success=False, output=None, error=f"Tool '{tool_id}' not found")
        try:
            result = await tool.handler(**kwargs)
            return MCPToolResult(tool_id=tool_id, success=True, output=result)
        except Exception as e:
            logger.error(f"MCP tool {tool_id} error: {e}")
            return MCPToolResult(tool_id=tool_id, success=False, output=None, error=str(e))

    async def invoke_many(self, calls: list[dict]) -> list[MCPToolResult]:
        """Invoke multiple tools concurrently."""
        tasks = [self.invoke(c["tool_id"], **c.get("args", {})) for c in calls]
        return await asyncio.gather(*tasks)
