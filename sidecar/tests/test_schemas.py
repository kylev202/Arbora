import pytest
from pydantic import ValidationError

from arbora_ai.schemas.output import CardOut, NoteOut, QuizItemOut, SourceRef


def _ref():
    return {"source_id": "s1", "location": {"type": "page", "page": 3}, "excerpt": "the mitochondria"}


def test_card_valid():
    card = CardOut.model_validate(
        {"front": "What makes ATP?", "back": "Mitochondria", "explanation": "", "source_ref": _ref()}
    )
    assert card.source_ref.location.page == 3


def test_card_requires_citation():
    with pytest.raises(ValidationError):
        CardOut.model_validate({"front": "Q?", "back": "A"})  # no source_ref


def test_quiz_needs_exactly_four_options():
    with pytest.raises(ValidationError):
        QuizItemOut.model_validate(
            {"question": "Which?", "options": ["a", "b", "c"], "answer_index": 0, "source_ref": _ref()}
        )


def test_quiz_answer_index_in_range():
    with pytest.raises(ValidationError):
        QuizItemOut.model_validate(
            {"question": "Which?", "options": ["a", "b", "c", "d"], "answer_index": 9, "source_ref": _ref()}
        )


def test_note_requires_a_source_ref():
    with pytest.raises(ValidationError):
        NoteOut.model_validate({"content": "x" * 40, "format": "outline", "source_refs": []})


def test_timestamp_location():
    ref = SourceRef.model_validate(
        {"source_id": "a", "location": {"type": "timestamp", "timestamp_ms": 1000}, "excerpt": "hi"}
    )
    assert ref.location.timestamp_ms == 1000
