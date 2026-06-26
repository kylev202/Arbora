"""In-memory background-job registry for long-running sidecar work.

Ingest and generation can take minutes, so the HTTP endpoints return a `job_id`
immediately and run the work on a thread pool; the Rust core polls
`/{kind}/{job_id}/status` and streams progress to the UI as Tauri events. State is
ephemeral (the durable record lives in Rust/SQLite) — a job is forgotten when the
sidecar restarts, which is fine because Rust owns retries.
"""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class Job:
    """One unit of background work and its live status."""

    id: str
    state: str = "pending"  # pending | running | done | error
    progress: float = 0.0  # 0..1
    step: str = ""
    error: str | None = None
    result: Any = None
    meta: dict[str, Any] = field(default_factory=dict)  # extra status fields (e.g. chunk_count)


class JobRegistry:
    """Thread-safe registry that runs job functions on a small pool."""

    def __init__(self, max_workers: int = 2):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="arbora-job")

    def create(self, job_id: str | None = None) -> Job:
        job = Job(id=job_id or str(uuid.uuid4()))
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def submit(self, job: Job, fn: Callable[[Job], None]) -> None:
        """Run `fn(job)` on the pool. `fn` mutates the job's progress/step/result;
        the wrapper flips state to running/done/error so workers never have to."""

        def _run() -> None:
            job.state = "running"
            try:
                fn(job)
            except Exception as exc:  # noqa: BLE001 — any failure is surfaced as job error
                job.state = "error"
                job.error = str(exc)
            else:
                job.state = "done"
                job.progress = 1.0

        self._pool.submit(_run)
