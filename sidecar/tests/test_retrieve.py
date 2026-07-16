"""Unit tests for hybrid retrieval (BM25 + rank fusion + neighbour expansion)."""

from __future__ import annotations

from arbora_ai.rag.retrieve import bm25_rank, expand_neighbors, fuse_ranks, hybrid_select

DOCS = [
    "The Krebs cycle produces NADH and FADH2 in the mitochondrial matrix.",
    "Photosynthesis converts light energy into chemical energy.",
    "Glycolysis splits glucose into two pyruvate molecules.",
]


def _chunks(*sources: str) -> list[dict]:
    return [{"source_id": s, "text": f"chunk {i}"} for i, s in enumerate(sources)]


def test_bm25_ranks_exact_term_first():
    assert bm25_rank("What is the Krebs cycle?", DOCS)[0] == 0


def test_bm25_excludes_nonmatching_docs():
    assert bm25_rank("Krebs", DOCS) == [0]


def test_bm25_empty_inputs():
    assert bm25_rank("", DOCS) == []
    assert bm25_rank("the of and", DOCS) == []  # stopwords only
    assert bm25_rank("Krebs", []) == []


def test_fuse_ranks_prefers_agreement():
    fused = fuse_ranks([[0, 1, 2], [1, 0]], k=2)
    assert set(fused) == {0, 1}


def test_fuse_ranks_single_engine_preserves_order():
    assert fuse_ranks([[2, 0]], k=2) == [2, 0]


def test_expand_neighbors_same_source_only():
    chunks = _chunks("a", "a", "b", "b")
    assert expand_neighbors([1], chunks) == [0, 1]  # position 2 is source b


def test_expand_neighbors_interleaved_sources():
    # Core order interleaves sources (ORDER BY chunk_index): a b a b.
    # Position 2 (source a) neighbours position 0 (source a), never b's chunks.
    chunks = _chunks("a", "b", "a", "b")
    assert expand_neighbors([2], chunks) == [0, 2]


def test_expand_neighbors_respects_cap():
    chunks = _chunks("a", "a", "a", "a", "a")
    out = expand_neighbors([2], chunks, max_extra=1)
    assert len(out) == 2
    assert 2 in out


def test_hybrid_select_finds_keyword_match_vector_missed():
    chunks = [
        {"source_id": "a", "text": "The Krebs cycle produces NADH."},
        {"source_id": "a", "text": "It happens in the mitochondrial matrix."},
        {"source_id": "b", "text": "Photosynthesis in chloroplasts."},
    ]
    # Vector ranking missed the defining chunk entirely; BM25 rescues it.
    out = hybrid_select("Krebs cycle", chunks, vector_positions=[2, 1], k=2)
    assert 0 in out


def test_hybrid_select_empty_when_nothing_ranks():
    assert hybrid_select("query", [], vector_positions=[], k=3) == []
