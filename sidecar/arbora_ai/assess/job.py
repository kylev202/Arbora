"""Practice-test worker: week-scoped chunks → grounded, cited test items.

Runs on the job pool (see `arbora_ai.jobs`), same shape as generate/job.py:
the Rust core sends chunk text + location, the worker rebuilds `Chunk`s, runs
the grounded test pipeline, and returns the kept items. The result is shown
once and never persisted (chat/diagram precedent — law #2 covers deck items).
"""

from __future__ import annotations

from typing import Any

from ..generate.job import _rebuild
from ..jobs import Job
from ..llm.provider import LLMUnavailableError, get_provider
from .pipeline import generate_test


def run_test_generate(
    job: Job,
    *,
    chunks: list[dict[str, Any]],
    types: list[str],
    count_per_type: int,
    llm_config: dict[str, Any],
) -> None:
    provider = get_provider(llm_config)
    if not provider.health():
        raise LLMUnavailableError("LLM_UNAVAILABLE: provider not reachable")

    rebuilt = _rebuild(chunks)

    job.step = "generating"
    job.progress = 0.02
    job.meta["items_generated"] = 0

    def on_progress(done: int, total: int, accepted: int) -> None:
        job.progress = 0.02 + 0.96 * (done / total) if total else 1.0
        job.meta["items_generated"] = accepted

    result = generate_test(
        provider, rebuilt, types, count_per_type=count_per_type, progress_cb=on_progress
    )

    job.result = result.model_dump()
    job.meta["items_generated"] = len(result.items)
