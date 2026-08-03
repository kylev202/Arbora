"""Unit tests for the week mind map generation module (no Ollama needed)."""

from __future__ import annotations

import pytest

from arbora_ai.diagram.session import generate_diagram
from arbora_ai.llm.provider import LLMProvider

SAMPLE_MERMAID = "graph TD\n    R[The Cell] --> A[Nucleus]\n    R --> B[Membrane]"


class FakeDiagramProvider(LLMProvider):
    def __init__(
        self,
        title: str = "The Cell — Week Overview",
        mermaid: str = SAMPLE_MERMAID,
        indices: list[int] | None = None,
    ):
        self._title = title
        self._mermaid = mermaid
        self._indices = indices or [1]

    def health(self) -> bool:
        return True

    def generate(self, prompt: str, schema=None, temperature: float = 0.1) -> dict:
        return {
            "title": self._title,
            "mermaid_code": self._mermaid,
            "used_passage_indices": self._indices,
        }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_generate_diagram_returns_title_code_and_citation():
    chunks = [
        {"source_id": "src1", "text": "The nucleus contains DNA.", "page": 1, "timestamp_ms": None},
        {"source_id": "src2", "text": "The membrane controls entry.", "page": 2, "timestamp_ms": None},
    ]
    provider = FakeDiagramProvider(indices=[1, 2])

    title, code, refs = generate_diagram(chunks, provider, week_title="The Cell")

    assert title == "The Cell — Week Overview"
    assert "graph TD" in code
    # both cited passages map to distinct sources, deduplicated by source_id
    assert {r.source_id for r in refs} == {"src1", "src2"}


def test_generate_diagram_spreads_across_the_week(monkeypatch):
    """More chunks than the cap are spread evenly, and cited indices map into the
    spread passages, not the raw list."""
    captured: dict[str, list[dict]] = {}

    def _spy(week_title, passages):
        captured["passages"] = passages
        return "PROMPT"

    monkeypatch.setattr("arbora_ai.diagram.session._mindmap_prompt", _spy)

    chunks = [
        {"source_id": f"src{i}", "text": f"chunk {i}", "page": i + 1, "timestamp_ms": None}
        for i in range(30)
    ]
    provider = FakeDiagramProvider(indices=[1])

    generate_diagram(chunks, provider, week_title="Wide Week", max_chunks=12)

    assert len(captured["passages"]) == 12
    assert captured["passages"][0]["source_id"] == "src0"  # spread starts at the top


def test_generate_diagram_timestamp_chunk():
    """Audio chunks produce TimestampLocation citations."""
    from arbora_ai.schemas.output import TimestampLocation

    chunks = [
        {"source_id": "src1", "text": "Lecture on cell biology.", "page": None, "timestamp_ms": 12000},
    ]
    provider = FakeDiagramProvider(indices=[1])

    _, _, refs = generate_diagram(chunks, provider, week_title="Cells")

    assert isinstance(refs[0].location, TimestampLocation)
    assert refs[0].location.timestamp_ms == 12000


def test_generate_diagram_invalid_indices_uses_fallback():
    """Out-of-range passage indices fall back to the first passage."""
    chunks = [
        {"source_id": "src1", "text": "Only chunk here.", "page": 5, "timestamp_ms": None},
    ]
    provider = FakeDiagramProvider(indices=[99, 100])

    _, _, refs = generate_diagram(chunks, provider, week_title="Topic")

    assert len(refs) == 1
    assert refs[0].source_id == "src1"


def test_generate_diagram_no_chunks_raises():
    with pytest.raises(ValueError, match="no indexed material"):
        generate_diagram([], FakeDiagramProvider(), week_title="Empty")
