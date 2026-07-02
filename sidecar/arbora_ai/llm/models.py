"""Ollama model management: readiness checks and pulls with real progress.

Backs the onboarding "download the model for your preset" step (and Settings
later). Local-only: it talks to the local Ollama daemon; nothing leaves the
device (law #3). The preset → model mapping stays in `config.PRESET_MODELS`.
"""

from __future__ import annotations

from typing import Any

import ollama

from ..config import OLLAMA_ENDPOINT, default_model
from ..jobs import Job


def _get(part: Any, key: str) -> Any:
    """Read a field from an ollama response part (dict or typed object)."""
    if isinstance(part, dict):
        return part.get(key)
    return getattr(part, key, None)


def model_ready(preset: str, endpoint: str = OLLAMA_ENDPOINT) -> dict:
    """Whether the preset's model is already pulled into the local Ollama store.

    `ollama_running=False` (with `ready=False`) means the daemon itself was
    unreachable — a different user-facing problem than "not downloaded yet".
    """
    model = default_model(preset)
    try:
        listing = ollama.Client(host=endpoint).list()
    except Exception:
        return {"model": model, "ready": False, "ollama_running": False}
    names = [_get(m, "model") or _get(m, "name") or "" for m in _get(listing, "models") or []]
    return {"model": model, "ready": model in names, "ollama_running": True}


def warmup_model(preset: str, endpoint: str = OLLAMA_ENDPOINT) -> None:
    """Load the preset's model into memory so the first real call isn't cold.

    An empty-prompt generate makes Ollama load the model and return without
    producing tokens. Raises on failure; callers treat warm-up as best-effort.
    """
    model = default_model(preset)
    ollama.Client(host=endpoint).generate(model=model, prompt="")


def pull_model(job: Job, preset: str, endpoint: str = OLLAMA_ENDPOINT) -> None:
    """Pull the preset's model, streaming layer progress into the job.

    Any failure (daemon down, out of disk, unknown model) raises and surfaces
    as the job's error — the UI shows it and offers a smaller preset.
    """
    model = default_model(preset)
    job.step = f"pulling {model}"
    for part in ollama.Client(host=endpoint).pull(model, stream=True):
        status = _get(part, "status")
        total = _get(part, "total")
        completed = _get(part, "completed")
        if status:
            job.step = str(status)
        # The GGUF blob dominates the download, so its layer ratio is an honest
        # overall bar. Hold at 0.99: the registry sets 1.0 when the pull returns.
        if total and completed:
            job.progress = min(completed / total, 0.99)
