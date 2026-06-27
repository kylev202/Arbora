"""Full pipeline integration test (fake provider, no Ollama needed).

Chains ingest → chunk → embed → FAISS index (save+reload) → retrieve → generate,
asserting that the sidecar's two main pipelines compose correctly end-to-end:
a raw SourceUnit produces a cited, grounded card via the same code path the
production run_ingest + run_generate use.
"""

from __future__ import annotations

import numpy as np

from arbora_ai.generate.pipeline import generate_from_chunks
from arbora_ai.ingest.chunk import Chunk, chunk_units
from arbora_ai.ingest.parse import SourceUnit
from arbora_ai.llm.provider import LLMProvider
from arbora_ai.rag.faiss_index import SubjectIndex

# ---------------------------------------------------------------------------
# Fake embedder: deterministic dim-8 vectors; different texts → different vecs
# ---------------------------------------------------------------------------

_DIM = 8


def _fake_embed(texts: list[str]) -> np.ndarray:
    """Hash-based fake: each text gets a unique unit vector (no Ollama needed)."""
    vecs = []
    for t in texts:
        v = np.zeros(_DIM, dtype="float32")
        for i, ch in enumerate(t[:_DIM]):
            v[i % _DIM] += ord(ch)
        norm = np.linalg.norm(v) or 1.0
        vecs.append(v / norm)
    return np.array(vecs, dtype="float32")


# ---------------------------------------------------------------------------
# Fake LLM provider: excerpt is verbatim in the chunk so grounding passes
# ---------------------------------------------------------------------------

class FakeProvider(LLMProvider):
    def health(self) -> bool:
        return True

    def generate(self, prompt: str, schema=None, temperature: float = 0.1) -> dict:
        # Pick a verbatim excerpt based on which source text is in the prompt
        if "mitochondria" in prompt.lower():
            return {
                "front": "What is the powerhouse of the cell?",
                "back": "Mitochondria",
                "explanation": "",
                "excerpt": "mitochondria",
            }
        if "photosynthesis" in prompt.lower():
            return {
                "front": "Where does photosynthesis occur?",
                "back": "Chloroplast",
                "explanation": "",
                "excerpt": "Photosynthesis",
            }
        return {"front": "?", "back": "?", "explanation": "", "excerpt": "x"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_UNITS = [
    SourceUnit(
        text="The mitochondria generate ATP for the eukaryotic cell via aerobic respiration.",
        location={"type": "page", "page": 1},
    ),
    SourceUnit(
        text="Photosynthesis occurs in the chloroplast, converting light energy into glucose.",
        location={"type": "page", "page": 2},
    ),
]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_chunk_units_produces_located_chunks():
    chunks = chunk_units(_UNITS, source_id="bio")
    assert len(chunks) >= 2
    pages = {c.location["page"] for c in chunks}
    assert 1 in pages and 2 in pages
    for c in chunks:
        assert c.source_id == "bio"
        assert c.text.strip()


def test_embed_and_faiss_roundtrip(tmp_path):
    """Chunks can be embedded, stored in FAISS, saved, reloaded, and searched."""
    chunks = chunk_units(_UNITS, source_id="bio")
    vectors = _fake_embed([c.text for c in chunks])

    index_path = tmp_path / "bio.index"
    idx = SubjectIndex(dim=_DIM)
    faiss_ids = idx.add(vectors)
    idx.save(index_path)

    # Reload from disk — simulates the sidecar restarting between ingest and generation
    idx2 = SubjectIndex.load(index_path)
    assert idx2.size == len(chunks)

    # Search with the query vector for the first chunk → it should rank first
    query = _fake_embed([chunks[0].text])
    _, ids = idx2.search(query, k=2)
    assert faiss_ids[0] in ids[0]


def test_full_pipeline_ingest_then_generate(tmp_path, monkeypatch):
    """End-to-end: SourceUnits → chunk → embed → FAISS → retrieve → generate.

    Exercises the same code paths as the production run_ingest + run_generate,
    confirming the two pipelines compose: grounded cards come out with correct
    source citations that trace back to the original pages.
    """
    monkeypatch.setattr("arbora_ai.rag.embeddings.embed_texts", _fake_embed)

    # --- ingest phase (what run_ingest does) ---
    from arbora_ai.rag.embeddings import embed_texts

    chunks = chunk_units(_UNITS, source_id="bio")
    vectors = embed_texts([c.text for c in chunks])

    index_path = tmp_path / "bio.index"
    idx = SubjectIndex(dim=_DIM)
    faiss_ids = idx.add(vectors)
    idx.save(index_path)

    # Build the lookup the Rust core would store in SQLite
    chunk_by_faiss_id: dict[int, Chunk] = dict(zip(faiss_ids, chunks))

    # --- retrieval phase (what the Rust core does: search + fetch from SQLite) ---
    idx2 = SubjectIndex.load(index_path)
    query_vec = embed_texts([chunks[0].text])
    _, ids = idx2.search(query_vec, k=len(chunks))
    retrieved = [chunk_by_faiss_id[fid] for fid in ids[0] if fid in chunk_by_faiss_id]

    # --- generation phase (what run_generate does) ---
    result, stats = generate_from_chunks(FakeProvider(), retrieved, types=["cards"])

    # At least one grounded card should come out
    assert result.cards, f"no cards produced; stats={stats['cards'].__dict__}"

    # Every card cites a real page from the source
    pages = {c.source_ref.location.page for c in result.cards}
    assert pages <= {1, 2}

    # Grounding law: excerpt must be verbatim in the chunk text
    from arbora_ai.generate.grounding import excerpt_grounded
    for card in result.cards:
        page = card.source_ref.location.page
        source_chunk = next(c for c in chunks if c.location.get("page") == page)
        assert excerpt_grounded(card.source_ref.excerpt, source_chunk.text), (
            f"grounding violated: excerpt={card.source_ref.excerpt!r} "
            f"not in chunk={source_chunk.text!r}"
        )
