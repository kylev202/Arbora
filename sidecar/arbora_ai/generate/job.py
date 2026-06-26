"""Generation worker: grounded chunks → cited cards / quiz items / notes.

Runs on the job pool (see `arbora_ai.jobs`). The sidecar is stateless about
chunks — the Rust core sends the chunk text + location (it owns the rows), the
worker rebuilds `Chunk`s, runs the grounded pipeline, and returns the kept items.
Nothing here is trusted: every item is `reviewed = false` until the human gate.
"""

from __future__ import annotations

from typing import Any

from ..ingest.chunk import Chunk
from ..jobs import Job
from ..llm.provider import LLMUnavailableError, get_provider
from . import generate_from_chunks


def _location(c: dict[str, Any]) -> dict[str, Any]:
    if c.get("timestamp_ms") is not None:
        return {"type": "timestamp", "timestamp_ms": c["timestamp_ms"]}
    return {"type": "page", "page": c.get("page")}


def run_generate(
    job: Job,
    *,
    chunks: list[dict[str, Any]],
    types: list[str],
    llm_config: dict[str, Any],
) -> None:
    """Build a provider from `llm_config`, generate from `chunks`, and store the
    kept `GenerationResult` in `job.result`. Streams progress via `job`."""
    provider = get_provider(llm_config)
    if not provider.health():
        raise LLMUnavailableError("LLM_UNAVAILABLE: provider not reachable")

    rebuilt = [
        Chunk(source_id=c["source_id"], text=c["text"], location=_location(c), index=c["chunk_index"])
        for c in chunks
    ]

    job.step = "generating"
    job.progress = 0.02
    job.meta["items_generated"] = 0

    def on_progress(done: int, total: int, accepted: int) -> None:
        job.progress = 0.02 + 0.96 * (done / total) if total else 1.0
        job.meta["items_generated"] = accepted

    result, _stats = generate_from_chunks(provider, rebuilt, types, progress_cb=on_progress)

    job.result = result.model_dump()
    job.meta["items_generated"] = len(result.cards) + len(result.quiz_items) + len(result.notes)
