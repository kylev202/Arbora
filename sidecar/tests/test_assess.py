"""Practice-test pipeline + grading, tested with fake providers (no Ollama)."""

from __future__ import annotations

import pytest

from arbora_ai.assess.grade import grade_answer
from arbora_ai.assess.pipeline import _spread, generate_test
from arbora_ai.ingest.chunk import Chunk
from arbora_ai.llm.provider import LLMProvider


def _chunk(text: str, idx: int) -> Chunk:
    return Chunk(source_id="bio", text=text, location={"type": "page", "page": idx + 1}, index=idx)


class FakeTestProvider(LLMProvider):
    """Returns a canned item per test kind; excerpts quote the chunk verbatim
    except for the 'ungrounded' chunk, whose excerpt is invented."""

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        grounded = "the eardrum vibrates" in prompt
        excerpt = "the eardrum vibrates" if grounded else "not in the passage"
        if "short-answer" in prompt:
            return {
                "question": "What vibrates to transmit sound?",
                "expected_answer": "The eardrum",
                "excerpt": excerpt,
            }
        if "matching exercises" in prompt:
            return {
                "instruction": "Match each part to its role.",
                "pairs": [
                    {"left": "Eardrum", "right": "Vibrates"},
                    {"left": "Cochlea", "right": "Transduces"},
                    {"left": "Ossicles", "right": "Amplify"},
                ],
                "excerpt": excerpt,
            }
        if "sequencing exercises" in prompt:
            return {
                "instruction": "Order the steps of hearing.",
                "steps": ["Sound reaches the ear", "The eardrum vibrates", "Signal to brain"],
                "excerpt": excerpt,
            }
        if "Feynman" in prompt:
            return {
                "concept": "Hearing",
                "key_points": ["Sound waves vibrate the eardrum", "Signals reach the brain"],
                "excerpt": excerpt,
            }
        # multiple choice (generate/prompts.py quiz prompt)
        return {
            "question": "What vibrates to transmit sound?",
            "options": ["The eardrum", "The lens", "The retina", "The tongue"],
            "answer_index": 0,
            "explanation": "",
            "excerpt": excerpt,
        }


def test_generates_one_item_per_requested_kind_with_authoritative_citation():
    chunks = [_chunk("the eardrum vibrates to transmit sound waves", 0)]
    kinds = ["multiple_choice", "short_answer", "matching", "ordering", "feynman"]
    result = generate_test(FakeTestProvider(), chunks, kinds, count_per_type=1)

    assert [i.kind for i in result.items] == kinds
    for item in result.items:
        assert item.source_ref.source_id == "bio"
        assert item.source_ref.location.page == 1  # from the chunk, not the model


def test_ungrounded_items_are_dropped_not_fixed():
    chunks = [_chunk("mitochondria make ATP for the cell", 0)]
    result = generate_test(
        FakeTestProvider(), chunks, ["short_answer", "matching"], count_per_type=1
    )
    assert result.items == []  # invented excerpt → dropped (law #1)


def test_unknown_kinds_are_ignored():
    chunks = [_chunk("the eardrum vibrates", 0)]
    result = generate_test(FakeTestProvider(), chunks, ["essay", "short_answer"], count_per_type=1)
    assert [i.kind for i in result.items] == ["short_answer"]


def test_spread_covers_the_whole_material():
    chunks = [_chunk(f"c{i}", i) for i in range(10)]
    picked = _spread(chunks, 3)
    assert len(picked) == 3
    assert picked[0].index == 0 and picked[-1].index > 5  # not just the first pages


class FakeGradeProvider(LLMProvider):
    def __init__(self, replies):
        self.replies = list(replies)

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        return self.replies.pop(0)


def test_grade_answer_returns_structured_verdict():
    provider = FakeGradeProvider([{"verdict": "partial", "feedback": "You named the eardrum."}])
    grade = grade_answer(provider, "What vibrates?", "The eardrum", "the ear drum thing")
    assert grade.verdict == "partial"
    assert "eardrum" in grade.feedback


def test_grade_answer_retries_then_raises_on_bad_shape():
    provider = FakeGradeProvider([{"verdict": "meh"}, {"nope": 1}, {"verdict": "sure"}])
    with pytest.raises(ValueError):
        grade_answer(provider, "Q", "A", "user answer")
