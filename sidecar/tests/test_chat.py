"""Unit tests for the RAG Q&A chat module (no Ollama needed)."""

from __future__ import annotations

import numpy as np
import pytest

from arbora_ai.llm.provider import LLMProvider
from arbora_ai.rag.faiss_index import SubjectIndex

_DIM = 8


def _fake_embed(texts: list[str]) -> np.ndarray:
    """Deterministic fake embedder — same shape as embed_texts, no Ollama."""
    vecs = []
    for t in texts:
        v = np.zeros(_DIM, dtype="float32")
        for i, ch in enumerate(t[:_DIM]):
            v[i % _DIM] += ord(ch)
        norm = np.linalg.norm(v) or 1.0
        vecs.append(v / norm)
    return np.array(vecs, dtype="float32")


class FakeChatProvider(LLMProvider):
    def __init__(self, answer: str = "The answer is [1].", indices: list[int] | None = None):
        self._answer = answer
        self._indices = indices or [1]

    def health(self) -> bool:
        return True

    def generate(self, prompt: str, schema=None, temperature: float = 0.1) -> dict:
        return {"answer": self._answer, "used_passage_indices": self._indices}


def _build_index(tmp_path, subject_id: str, chunks: list[dict]) -> None:
    """Write a FAISS index for the given chunks into tmp_path/faiss/{subject_id}.index."""
    vecs = _fake_embed([c["text"] for c in chunks])
    idx = SubjectIndex(dim=_DIM)
    idx.add(vecs)
    faiss_dir = tmp_path / "faiss"
    faiss_dir.mkdir(exist_ok=True)
    idx.save(faiss_dir / f"{subject_id}.index")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_answer_question_returns_answer_and_citation(tmp_path, monkeypatch):
    monkeypatch.setattr("arbora_ai.chat.session.embed_texts", _fake_embed)

    from arbora_ai.chat.session import answer_question

    chunks = [
        {"faiss_id": 0, "source_id": "src1", "text": "Mitochondria produce ATP.", "page": 1, "timestamp_ms": None},
        {"faiss_id": 1, "source_id": "src2", "text": "Chloroplasts do photosynthesis.", "page": 2, "timestamp_ms": None},
    ]
    _build_index(tmp_path, "subj1", chunks)
    provider = FakeChatProvider(answer="ATP is made by mitochondria [1].", indices=[1])

    answer, refs = answer_question(
        question="What makes ATP?",
        subject_id="subj1",
        chunks=chunks,
        provider=provider,
        data_dir=str(tmp_path),
        k=2,
    )

    assert "ATP" in answer
    assert len(refs) >= 1
    assert refs[0].source_id in {"src1", "src2"}
    assert refs[0].location.page in {1, 2}


def test_answer_question_timestamp_chunk(tmp_path, monkeypatch):
    """Audio chunks (timestamp_ms) produce TimestampLocation citations."""
    monkeypatch.setattr("arbora_ai.chat.session.embed_texts", _fake_embed)

    from arbora_ai.chat.session import answer_question
    from arbora_ai.schemas.output import TimestampLocation

    chunks = [
        {"faiss_id": 0, "source_id": "src1", "text": "Lecture content here.", "page": None, "timestamp_ms": 5000},
    ]
    _build_index(tmp_path, "subj1", chunks)
    provider = FakeChatProvider(indices=[1])

    _, refs = answer_question("What?", "subj1", chunks, provider, str(tmp_path), k=1)

    assert isinstance(refs[0].location, TimestampLocation)
    assert refs[0].location.timestamp_ms == 5000


def test_answer_question_invalid_indices_uses_fallback(tmp_path, monkeypatch):
    """When the model cites out-of-range indices, fallback to the top chunk."""
    monkeypatch.setattr("arbora_ai.chat.session.embed_texts", _fake_embed)

    from arbora_ai.chat.session import answer_question

    chunks = [
        {"faiss_id": 0, "source_id": "src1", "text": "Only chunk.", "page": 3, "timestamp_ms": None},
    ]
    _build_index(tmp_path, "subj1", chunks)
    provider = FakeChatProvider(indices=[99, 100])  # all invalid

    _, refs = answer_question("Q?", "subj1", chunks, provider, str(tmp_path), k=1)

    assert len(refs) == 1
    assert refs[0].source_id == "src1"


def test_answer_question_no_chunks_raises(tmp_path, monkeypatch):
    monkeypatch.setattr("arbora_ai.chat.session.embed_texts", _fake_embed)

    from arbora_ai.chat.session import answer_question

    with pytest.raises(ValueError, match="no indexed material"):
        answer_question("Q?", "s1", [], FakeChatProvider(), str(tmp_path))


def test_answer_question_no_index_raises(tmp_path, monkeypatch):
    monkeypatch.setattr("arbora_ai.chat.session.embed_texts", _fake_embed)

    from arbora_ai.chat.session import answer_question

    chunks = [{"faiss_id": 0, "source_id": "src1", "text": "x", "page": 1, "timestamp_ms": None}]
    # no index file written — tmp_path/faiss/missing_subj.index doesn't exist
    with pytest.raises(ValueError, match="no indexed material"):
        answer_question("Q?", "missing_subj", chunks, FakeChatProvider(), str(tmp_path))


def test_answer_question_deduplicates_source_refs(tmp_path, monkeypatch):
    """When two top chunks share a source_id, only one citation is emitted."""
    monkeypatch.setattr("arbora_ai.chat.session.embed_texts", _fake_embed)

    from arbora_ai.chat.session import answer_question

    chunks = [
        {"faiss_id": 0, "source_id": "src1", "text": "First chunk.", "page": 1, "timestamp_ms": None},
        {"faiss_id": 1, "source_id": "src1", "text": "Second chunk.", "page": 2, "timestamp_ms": None},
    ]
    _build_index(tmp_path, "subj1", chunks)
    provider = FakeChatProvider(indices=[1, 2])  # both passages cited

    _, refs = answer_question("Q?", "subj1", chunks, provider, str(tmp_path), k=2)

    assert len(refs) == 1, "deduplication by source_id"
    assert refs[0].source_id == "src1"
