"""Grading of free-text answers (short answer / Feynman) — structured, bounded.

The model compares the student's answer ONLY against the item's expected answer
or key points, which are themselves grounded content from the generation step.
Grades are ephemeral feedback, never persisted.
"""

from __future__ import annotations

from pydantic import ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError
from ..schemas.output import GradeGen
from .prompts import grade_prompt

MAX_RETRIES = 2


def grade_answer(
    provider: LLMProvider, question: str, expected: str, user_answer: str
) -> GradeGen:
    """One structured grading call with bounded retry. Raises ValueError when the
    model never produces a valid shape."""
    prompt = grade_prompt(question, expected, user_answer)
    schema = GradeGen.model_json_schema()
    for attempt in range(MAX_RETRIES + 1):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            return GradeGen.model_validate(raw)
        except (LLMSchemaError, ValidationError):
            continue
    raise ValueError("model failed to produce a structured grade")
