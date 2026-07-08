"""Parse an assignment spec or rubric to text, then extract structure from it.

Mirrors `outline/extract.py`: file → text (reusing `syllabus_to_text`, which is
a generic document reader) → constrained generate against the Pydantic schema →
validate → bounded retries → raise. We never parse free text (llm-grounding).
The LLM extracts *only* what the document contains; the user reviews and edits
every row before anything is committed.
"""

from __future__ import annotations

from pydantic import ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError
from ..outline.extract import MAX_STRUCTURE_RETRIES
from ..schemas.output import RubricExtraction, SpecExtraction


def spec_prompt(text: str, assignment_title: str) -> str:
    """Instruction for the assignment-spec extraction."""
    title_line = f" for the assignment '{assignment_title}'" if assignment_title else ""
    return (
        f"You are extracting the key information from a university assignment "
        f"specification{title_line}.\n"
        "Use ONLY information stated in the document below. Do NOT invent "
        "requirements, dates, or steps — leave a field empty if the document "
        "doesn't state it.\n\n"
        "Return JSON with:\n"
        "- overview: 1-3 sentences on what the assignment asks for.\n"
        "- due_date: ISO YYYY-MM-DD if a due date is given, else empty string.\n"
        "- requirements: what must be delivered/covered, one string per "
        "requirement, in the document's order.\n"
        "- process_steps: how submission, marking, or feedback runs (e.g. "
        "'submit via Turnitin'), one string per step.\n"
        "- plan_steps: the concrete steps a student would take to complete the "
        "work, in order, based on the tasks the document describes.\n\n"
        "--- DOCUMENT ---\n"
        f"{text}\n"
        "--- END DOCUMENT ---"
    )


def rubric_prompt(text: str) -> str:
    """Instruction for the rubric extraction."""
    return (
        "You are extracting the marking rubric from a university assignment "
        "document.\n"
        "Use ONLY information stated in the document below. Do NOT invent "
        "criteria or levels — leave a field empty if the document doesn't "
        "state it.\n\n"
        "Return JSON with:\n"
        "- criteria: each {name (the criterion being marked), weight_text (its "
        "weighting exactly as written, e.g. '30%' or '5 marks', else empty), "
        "levels: each {label (the performance level, e.g. 'High Distinction', "
        "'Pass'), descriptor (what that level requires, as written)}}.\n"
        "Order criteria and levels as the document lists them.\n\n"
        "--- DOCUMENT ---\n"
        f"{text}\n"
        "--- END DOCUMENT ---"
    )


def extract_spec(provider: LLMProvider, text: str, assignment_title: str = "") -> SpecExtraction:
    """Constrained-generate the spec extraction and validate it, retrying
    structure failures. Raises LLMSchemaError if the model never returns a
    valid shape — unlike unit info, this extraction is the whole request."""
    schema = SpecExtraction.model_json_schema()
    prompt = spec_prompt(text, assignment_title)
    last_err: Exception | None = None
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            return SpecExtraction.model_validate(raw)
        except (LLMSchemaError, ValidationError) as exc:
            last_err = exc
            continue
    raise LLMSchemaError(f"could not extract a structured spec after retries: {last_err}")


def extract_rubric(provider: LLMProvider, text: str) -> RubricExtraction:
    """Constrained-generate the rubric extraction; same contract as
    `extract_spec`."""
    schema = RubricExtraction.model_json_schema()
    prompt = rubric_prompt(text)
    last_err: Exception | None = None
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            return RubricExtraction.model_validate(raw)
        except (LLMSchemaError, ValidationError) as exc:
            last_err = exc
            continue
    raise LLMSchemaError(f"could not extract a structured rubric after retries: {last_err}")
