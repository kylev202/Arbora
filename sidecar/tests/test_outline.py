"""Syllabus outline extraction (slice 4): file→text + LLM extraction.

A fake provider stands in for Ollama so these are fast and deterministic.
"""

from __future__ import annotations

import pytest

from arbora_ai.llm.provider import LLMProvider, LLMSchemaError
from arbora_ai.outline.extract import extract_outline, syllabus_to_text
from arbora_ai.schemas.output import OutlineExtraction

SYLLABUS = (
    "BIOL101 Cell Biology\n"
    "Week 1: Introduction to cells\n"
    "Week 2: The cell membrane\n"
    "Assignment 1 due 2026-03-15\n"
    "Final exam 2026-06-20\n"
)


class FakeProvider(LLMProvider):
    """Returns a schema-valid outline, branching on the requested schema."""

    def __init__(self, payload: dict | None = None):
        self._payload = payload

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        if self._payload is not None:
            return self._payload
        return {
            "weeks": [
                {"week_number": 1, "title": "Introduction to cells", "summary": ""},
                {"week_number": 2, "title": "The cell membrane", "summary": ""},
            ],
            "deadlines": [
                {"title": "Assignment 1", "due_date": "2026-03-15", "type": "assignment"},
                {"title": "Final exam", "due_date": "2026-06-20", "type": "exam"},
            ],
        }


def test_extract_outline_parses_weeks_and_deadlines():
    result = extract_outline(FakeProvider(), SYLLABUS)
    assert isinstance(result, OutlineExtraction)
    assert [w.week_number for w in result.weeks] == [1, 2]
    assert result.weeks[1].title == "The cell membrane"
    assert result.deadlines[0].type == "assignment"
    assert result.deadlines[1].due_date == "2026-06-20"


def test_extract_outline_retries_then_raises_on_junk():
    # Never schema-valid (week_number 0 < 1) → exhausts retries and raises.
    bad = FakeProvider({"weeks": [{"week_number": 0, "title": "x"}], "deadlines": []})
    with pytest.raises(LLMSchemaError):
        extract_outline(bad, SYLLABUS)


def test_extract_outline_accepts_empty_arrays():
    empty = FakeProvider({"weeks": [], "deadlines": []})
    result = extract_outline(empty, SYLLABUS)
    assert result.weeks == []
    assert result.deadlines == []


def test_syllabus_to_text_reads_text_file(tmp_path):
    f = tmp_path / "syllabus.txt"
    f.write_text(SYLLABUS, encoding="utf-8")
    assert "cell membrane" in syllabus_to_text(f)


def test_syllabus_to_text_rejects_unsupported(tmp_path):
    bad = tmp_path / "syllabus.csv"
    bad.write_text("week,topic\n1,cells", encoding="utf-8")
    with pytest.raises(ValueError, match="unsupported"):
        syllabus_to_text(bad)


def test_syllabus_to_text_empty_file(tmp_path):
    empty = tmp_path / "empty.txt"
    empty.write_text("   ", encoding="utf-8")
    with pytest.raises(ValueError, match="no text could be extracted"):
        syllabus_to_text(empty)


def test_syllabus_to_text_reads_docx(tmp_path):
    from docx import Document

    path = tmp_path / "syllabus.docx"
    doc = Document()
    doc.add_paragraph("Week 1: Introduction to cells")
    doc.add_paragraph("Week 2: The cell membrane")
    doc.save(str(path))

    text = syllabus_to_text(path)
    assert "Introduction to cells" in text
    assert "cell membrane" in text
