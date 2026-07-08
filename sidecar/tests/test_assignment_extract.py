"""Assignment spec + rubric extraction: constrained generate → validate → retry.

A fake provider stands in for Ollama so these are fast and deterministic.
"""

from __future__ import annotations

import pytest

from arbora_ai.assignment.extract import extract_rubric, extract_spec, rubric_prompt, spec_prompt
from arbora_ai.llm.provider import LLMProvider, LLMSchemaError

SPEC_TEXT = (
    "Assignment 1: Cell Report\n"
    "Due 2026-03-15 via Turnitin.\n"
    "Write a 2000-word report on cell membrane transport.\n"
)

SPEC_PAYLOAD = {
    "overview": "A 2000-word report on cell membrane transport.",
    "due_date": "2026-03-15",
    "requirements": ["2000-word report", "Cover membrane transport"],
    "process_steps": ["Submit via Turnitin"],
    "plan_steps": ["Research transport mechanisms", "Draft the report", "Revise and submit"],
}

RUBRIC_PAYLOAD = {
    "criteria": [
        {
            "name": "Scientific accuracy",
            "weight_text": "40%",
            "levels": [
                {"label": "HD", "descriptor": "All mechanisms correct and well-sourced."},
                {"label": "Pass", "descriptor": "Mostly correct with minor gaps."},
            ],
        },
        {"name": "Referencing", "weight_text": "", "levels": []},
    ]
}


class FakeProvider(LLMProvider):
    def __init__(self, payload: dict):
        self._payload = payload

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        return self._payload


def test_extract_spec_parses_all_sections():
    spec = extract_spec(FakeProvider(SPEC_PAYLOAD), SPEC_TEXT, "Assignment 1")
    assert spec.due_date == "2026-03-15"
    assert spec.requirements == ["2000-word report", "Cover membrane transport"]
    assert spec.process_steps == ["Submit via Turnitin"]
    assert spec.plan_steps[0] == "Research transport mechanisms"


def test_extract_spec_retries_then_raises_on_junk():
    # Never schema-valid (empty-string item violates min_length=1).
    bad = FakeProvider({"requirements": [""]})
    with pytest.raises(LLMSchemaError):
        extract_spec(bad, SPEC_TEXT)


def test_extract_rubric_parses_criteria_and_levels():
    rubric = extract_rubric(FakeProvider(RUBRIC_PAYLOAD), SPEC_TEXT)
    assert [c.name for c in rubric.criteria] == ["Scientific accuracy", "Referencing"]
    assert rubric.criteria[0].levels[0].label == "HD"
    assert rubric.criteria[1].levels == []


def test_extract_rubric_retries_then_raises_on_junk():
    bad = FakeProvider({"criteria": [{"name": ""}]})  # name violates min_length=1
    with pytest.raises(LLMSchemaError):
        extract_rubric(bad, SPEC_TEXT)


def test_prompts_forbid_invention_and_embed_the_document():
    sp = spec_prompt(SPEC_TEXT, "Assignment 1")
    assert "Do NOT invent" in sp
    assert "Assignment 1" in sp
    assert SPEC_TEXT in sp
    rp = rubric_prompt(SPEC_TEXT)
    assert "Do NOT invent" in rp
    assert SPEC_TEXT in rp
