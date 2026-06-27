"""Unit tests for the Mermaid diagram generation module (no Ollama needed)."""

from __future__ import annotations

import numpy as np
import pytest

from arbora_ai.llm.provider import LLMProvider
from arbora_ai.rag.faiss_index import SubjectIndex

_DIM = 8

SAMPLE_MERMAID = "graph TD\n    A[Nucleus] --> B[DNA]"


def _fake_embed(texts: list[str]) -> np.ndarray:
    vecs = []
    for t in texts:
        v = np.zeros(_DIM, dtype="float32")
        for i, ch in enumerate(t[:_DIM]):
            v[i % _DIM] += ord(ch)
        norm = np.linalg.norm(v) or 1.0
        vecs.append(v / norm)
    return np.array(vecs, dtype="float32")


class FakeDiagramProvider(LLMProvider):
    def __init__(
        self,
        title: str = "Cell Structure Overview",
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


def _build_index(tmp_path, subject_id: str, chunks: list[dict]) -> None:
    vecs = _fake_embed([c["text"] for c in chunks])
    idx = SubjectIndex(dim=_DIM)
    idx.add(vecs)
    faiss_dir = tmp_path / "faiss"
    faiss_dir.mkdir(exist_ok=True)
    idx.save(faiss_dir / f"{subject_id}.index")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_generate_diagram_returns_title_code_and_citation(tmp_path, monkeypatch):
    monkeypatch.setattr("arbora_ai.diagram.session.embed_texts", _fake_embed)

    from arbora_ai.diagram.session import generate_diagram

    chunks = [
        {"faiss_id": 0, "source_id": "src1", "text": "The nucleus contains DNA.", "page": 1, "timestamp_ms": None},
        {"faiss_id": 1, "source_id": "src2", "text": "The membrane controls entry.", "page": 2, "timestamp_ms": None},
    ]
    _build_index(tmp_path, "subj1", chunks)
    provider = FakeDiagramProvider(indices=[1])

    title, code, refs = generate_diagram("cell structure", "subj1", chunks, provider, str(tmp_path), k=2)

    assert title == "Cell Structure Overview"
    assert "graph TD" in code
    assert len(refs) >= 1
    assert refs[0].source_id in {"src1", "src2"}


def test_generate_diagram_timestamp_chunk(tmp_path, monkeypatch):
    """Audio chunks produce TimestampLocation citations."""
    monkeypatch.setattr("arbora_ai.diagram.session.embed_texts", _fake_embed)

    from arbora_ai.diagram.session import generate_diagram
    from arbora_ai.schemas.output import TimestampLocation

    chunks = [
        {"faiss_id": 0, "source_id": "src1", "text": "Lecture on cell biology.", "page": None, "timestamp_ms": 12000},
    ]
    _build_index(tmp_path, "subj1", chunks)
    provider = FakeDiagramProvider(indices=[1])

    _, _, refs = generate_diagram("cells", "subj1", chunks, provider, str(tmp_path), k=1)

    assert isinstance(refs[0].location, TimestampLocation)
    assert refs[0].location.timestamp_ms == 12000


def test_generate_diagram_invalid_indices_uses_fallback(tmp_path, monkeypatch):
    """Out-of-range passage indices fall back to the top chunk."""
    monkeypatch.setattr("arbora_ai.diagram.session.embed_texts", _fake_embed)

    from arbora_ai.diagram.session import generate_diagram

    chunks = [
        {"faiss_id": 0, "source_id": "src1", "text": "Only chunk here.", "page": 5, "timestamp_ms": None},
    ]
    _build_index(tmp_path, "subj1", chunks)
    provider = FakeDiagramProvider(indices=[99, 100])

    _, _, refs = generate_diagram("topic", "subj1", chunks, provider, str(tmp_path), k=1)

    assert len(refs) == 1
    assert refs[0].source_id == "src1"


def test_generate_diagram_no_chunks_raises(tmp_path, monkeypatch):
    monkeypatch.setattr("arbora_ai.diagram.session.embed_texts", _fake_embed)

    from arbora_ai.diagram.session import generate_diagram

    with pytest.raises(ValueError, match="no indexed material"):
        generate_diagram("topic", "s1", [], FakeDiagramProvider(), str(tmp_path))


def test_generate_diagram_no_index_raises(tmp_path, monkeypatch):
    monkeypatch.setattr("arbora_ai.diagram.session.embed_texts", _fake_embed)

    from arbora_ai.diagram.session import generate_diagram

    chunks = [{"faiss_id": 0, "source_id": "src1", "text": "x", "page": 1, "timestamp_ms": None}]
    with pytest.raises(ValueError, match="no indexed material"):
        generate_diagram("topic", "missing_subj", chunks, FakeDiagramProvider(), str(tmp_path))
