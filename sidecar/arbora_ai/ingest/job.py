"""Ingest worker: a source file → located, embedded, FAISS-indexed chunks.

Runs on the job pool (see `arbora_ai.jobs`). The sidecar owns the per-subject
FAISS index file; it returns chunk *metadata* (text + location + faiss_id) for the
Rust core to persist in SQLite. That split keeps Rust the single owner of durable
relational state and the sidecar the owner of the vector store.
"""

from __future__ import annotations

from pathlib import Path

from ..jobs import Job
from ..rag.embeddings import embed_texts
from ..rag.faiss_index import SubjectIndex
from .chunk import chunk_units
from .parse import parse_source


def faiss_path(data_dir: str | Path, subject_id: str) -> Path:
    """Location of a subject's FAISS index under the app data dir."""
    return Path(data_dir) / "faiss" / f"{subject_id}.index"


def run_ingest(
    job: Job,
    *,
    source_id: str,
    subject_id: str,
    file_path: str,
    source_type: str,
    data_dir: str | Path,
) -> None:
    """Parse → chunk → embed → add to the subject's FAISS index. Populates
    `job.result` with chunk metadata and `job.meta` with chunk/page counts."""
    job.step = "transcribing" if source_type == "audio" else "parsing"
    job.progress = 0.05
    units = parse_source(file_path, source_type)

    job.step = "chunking"
    job.progress = 0.3
    chunks = chunk_units(units, source_id=source_id)

    if not chunks:
        # Scanned PDF / empty deck / silent audio — nothing to index. Not an error.
        job.result = []
        job.meta["chunk_count"] = 0
        job.meta["page_count"] = _page_count(units)
        return

    job.step = "embedding"
    job.progress = 0.5
    vectors = embed_texts([c.text for c in chunks])

    path = faiss_path(data_dir, subject_id)
    index = SubjectIndex.load(path) if path.exists() else SubjectIndex(dim=int(vectors.shape[1]))
    faiss_ids = index.add(vectors)
    index.save(path)

    job.result = [
        {
            "text": c.text,
            "page": c.location.get("page"),
            "timestamp_ms": c.location.get("timestamp_ms"),
            "faiss_id": fid,
            "chunk_index": c.index,
        }
        for c, fid in zip(chunks, faiss_ids)
    ]
    job.meta["chunk_count"] = len(chunks)
    job.meta["page_count"] = _page_count(units)


def _page_count(units: list) -> int | None:
    """Highest page number seen (pdf/slide); None for audio/no-pages."""
    pages = [u.location.get("page") for u in units if u.location.get("page") is not None]
    return max(pages) if pages else None
