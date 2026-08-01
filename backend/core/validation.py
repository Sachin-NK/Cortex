from __future__ import annotations
"""
Output Validation — validates model outputs using JSON schema, Pydantic,
and a producer-reviewer pattern.
"""
import json
import re
from dataclasses import dataclass
from typing import Any, List, Dict, Optional, Type
from pydantic import BaseModel, ValidationError


@dataclass
class ValidationResult:
    valid: bool
    data: Any = None
    errors: list[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []


class OutputValidator:
    def validate_json(self, text: str, model_class: Optional[Type[BaseModel]] = None) -> ValidationResult:
        """Extract and validate JSON from model output."""
        # Try to extract JSON from markdown code blocks first
        json_match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
        raw = json_match.group(1).strip() if json_match else text.strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            return ValidationResult(valid=False, errors=[f"JSON parse error: {e}"])

        if model_class:
            try:
                validated = model_class.model_validate(data)
                return ValidationResult(valid=True, data=validated.model_dump())
            except ValidationError as e:
                return ValidationResult(valid=False, errors=[str(e)])

        return ValidationResult(valid=True, data=data)

    def validate_code(self, text: str, language: str = "python") -> ValidationResult:
        """Basic code extraction and sanity check."""
        code_match = re.search(r"```(?:\w+)?\s*([\s\S]+?)```", text)
        code = code_match.group(1).strip() if code_match else text.strip()

        if not code:
            return ValidationResult(valid=False, errors=["No code found in output"])

        # Basic checks
        errors = []
        if language == "python":
            # Check for obvious syntax issues
            try:
                compile(code, "<string>", "exec")
            except SyntaxError as e:
                errors.append(f"Syntax error: {e}")

        return ValidationResult(valid=len(errors) == 0, data=code, errors=errors)

    def validate_not_empty(self, text: str, min_length: int = 10) -> ValidationResult:
        if not text or len(text.strip()) < min_length:
            return ValidationResult(valid=False, errors=["Output too short or empty"])
        return ValidationResult(valid=True, data=text)

    def validate_no_secrets(self, text: str) -> ValidationResult:
        """Ensure output doesn't contain leaked secrets."""
        from .security import SECRET_PATTERNS
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                return ValidationResult(valid=False, errors=["Possible secret detected in output"])
        return ValidationResult(valid=True, data=text)


# Pydantic schemas for common structured outputs
class CodeReviewOutput(BaseModel):
    summary: str
    issues: List[Dict]
    severity: str  # low | medium | high | critical
    recommendation: str


class ArchitectureOutput(BaseModel):
    components: List[Dict]
    data_flow: str
    risks: List[str]
    decisions: List[Dict]


class TaskPlanOutput(BaseModel):
    tasks: List[Dict]
    dependencies: List[Dict]
    estimated_effort: str
