from __future__ import annotations
"""
Task Classifier — classifies incoming requests by type, complexity,
and capability requirements so the router can make better decisions.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List


class TaskType(str, Enum):
    REPOSITORY_ANALYSIS = "repository_analysis"
    ARCHITECTURE_DESIGN = "architecture_design"
    CODE_GENERATION = "code_generation"
    REFACTORING = "refactoring"
    DEBUGGING = "debugging"
    TEST_GENERATION = "test_generation"
    SECURITY_REVIEW = "security_review"
    DOCUMENTATION = "documentation"
    RESEARCH = "research"
    STRUCTURED_EXTRACTION = "structured_extraction"
    MULTIMODAL_ANALYSIS = "multimodal_analysis"
    FINAL_VERIFICATION = "final_verification"
    GENERAL = "general"


class Complexity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class TaskClassification:
    task_type: TaskType
    complexity: Complexity
    requires_vision: bool = False
    requires_long_context: bool = False
    requires_code: bool = False
    requires_reasoning: bool = False

    def is_high_stakes(self) -> bool:
        """Return True for critical complexity or security/architecture task types."""
        return self.complexity == Complexity.CRITICAL or self.task_type in (
            TaskType.SECURITY_REVIEW,
            TaskType.ARCHITECTURE_DESIGN,
            TaskType.FINAL_VERIFICATION,
        )
    requires_tools: bool = False
    security_sensitive: bool = False
    cost_sensitive: bool = False
    latency_sensitive: bool = False
    estimated_context_tokens: int = 0
    preferred_output_format: str = "text"  # text | json | markdown | code
    confidence: float = 1.0


# Keyword maps for heuristic classification
_TYPE_KEYWORDS: list[tuple[TaskType, list[str]]] = [
    (TaskType.REPOSITORY_ANALYSIS, ["analyze repository", "repo analysis", "codebase", "map the repo", "entire project"]),
    (TaskType.ARCHITECTURE_DESIGN, ["design architecture", "system design", "design a system", "architect", "microservice", "design pattern"]),
    (TaskType.CODE_GENERATION, ["write code", "implement", "create a function", "generate code", "build a class", "write a script"]),
    (TaskType.REFACTORING, ["refactor", "clean up", "improve code", "restructure", "optimize code"]),
    (TaskType.DEBUGGING, ["debug", "fix bug", "error", "exception", "traceback", "not working", "failing"]),
    (TaskType.TEST_GENERATION, ["write tests", "unit test", "integration test", "test coverage", "pytest", "jest"]),
    (TaskType.SECURITY_REVIEW, ["security", "vulnerability", "injection", "xss", "csrf", "audit", "penetration", "secret"]),
    (TaskType.DOCUMENTATION, ["document", "readme", "docstring", "api docs", "write documentation", "explain"]),
    (TaskType.RESEARCH, ["research", "find information", "summarize", "compare", "investigate", "what is"]),
    (TaskType.STRUCTURED_EXTRACTION, ["extract", "parse json", "structured output", "fill in", "table", "csv", "spreadsheet"]),
    (TaskType.MULTIMODAL_ANALYSIS, ["image", "screenshot", "photo", "picture", "diagram", "visual"]),
    (TaskType.FINAL_VERIFICATION, ["final review", "verify", "approve", "sign off", "acceptance", "last check"]),
]

_COMPLEXITY_KEYWORDS: dict[Complexity, list[str]] = {
    Complexity.CRITICAL: ["production", "critical", "security", "auth", "payment", "compliance", "hipaa", "gdpr"],
    Complexity.HIGH: ["architecture", "entire", "full system", "refactor all", "migration", "database schema"],
    Complexity.LOW: ["simple", "quick", "small", "minor", "one line", "rename", "typo"],
}


class TaskClassifier:
    def classify(self, messages: List[dict], budget_hint: Optional[str] = None) -> TaskClassification:
        text = " ".join(
            m.get("content", "") for m in messages
            if isinstance(m.get("content"), str)
        ).lower()

        task_type = self._detect_type(text)
        complexity = self._detect_complexity(text)

        # Multimodal check: any message with non-string content (image parts)
        has_images = any(
            isinstance(m.get("content"), list) for m in messages
        )

        ctx_estimate = sum(
            len(m.get("content", "").split()) * 1.3
            for m in messages if isinstance(m.get("content"), str)
        )

        return TaskClassification(
            task_type=task_type,
            complexity=complexity,
            requires_vision=has_images or task_type == TaskType.MULTIMODAL_ANALYSIS,
            requires_long_context=ctx_estimate > 8000 or task_type == TaskType.REPOSITORY_ANALYSIS,
            requires_code=task_type in (
                TaskType.CODE_GENERATION, TaskType.DEBUGGING,
                TaskType.REFACTORING, TaskType.TEST_GENERATION,
            ),
            requires_reasoning=task_type in (
                TaskType.ARCHITECTURE_DESIGN, TaskType.SECURITY_REVIEW,
                TaskType.FINAL_VERIFICATION,
            ),
            requires_tools=any(k in text for k in ["use tool", "search", "browse", "fetch", "run", "execute"]),
            security_sensitive=task_type == TaskType.SECURITY_REVIEW or complexity == Complexity.CRITICAL,
            cost_sensitive=budget_hint == "lowest_cost",
            latency_sensitive=budget_hint == "lowest_latency",
            estimated_context_tokens=int(ctx_estimate),
            preferred_output_format=self._detect_output_format(text),
        )

    def _detect_type(self, text: str) -> TaskType:
        for task_type, keywords in _TYPE_KEYWORDS:
            if any(k in text for k in keywords):
                return task_type
        return TaskType.GENERAL

    def _detect_complexity(self, text: str) -> Complexity:
        for complexity, keywords in _COMPLEXITY_KEYWORDS.items():
            if any(k in text for k in keywords):
                return complexity
        return Complexity.MEDIUM

    def _detect_output_format(self, text: str) -> str:
        if any(k in text for k in ["json", "yaml", "structured", "parse", "extract"]):
            return "json"
        if any(k in text for k in ["markdown", "readme", "documentation", "report"]):
            return "markdown"
        if any(k in text for k in ["code", "function", "class", "implement", "script"]):
            return "code"
        return "text"
