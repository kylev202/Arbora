"""Sidecar generation layer: the worker + the /generate endpoints.

A fake provider stands in for Ollama so these are fast and deterministic. Its
`excerpt` is a verbatim substring of the chunk text, so the grounding checks
(law #1) keep the items — that path is what we're asserting.
"""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from arbora_ai.jobs import Job
from arbora_ai.server import app

CHUNK_TEXT = "Mitochondria are the powerhouse of the cell and generate ATP for the body."
EXCERPT = "powerhouse of the cell"


class FakeProvider:
    """Returns schema-valid content with a verbatim excerpt, branching on the
    requested schema (quiz has options, note has content, else card)."""

    def health(self) -> bool:
        return True

    def generate(self, prompt: str, schema: dict | None = None, temperature: float = 0.1) -> dict:
        props = (schema or {}).get("properties", {})
        if "options" in props:
            return {
                "question": "What is the powerhouse of the cell?",
                "options": ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
                "answer_index": 0,
                "explanation": "",
                "excerpt": EXCERPT,
            }
        if "content" in props:
            return {
                "content": "Mitochondria generate ATP and act as the cell's powerhouse.",
                "format": "outline",
                "excerpt": EXCERPT,
            }
        return {
            "front": "What is the powerhouse of the cell?",
            "back": "Mitochondria",
            "explanation": "",
            "excerpt": EXCERPT,
        }


def _chunk(**over):
    base = {"source_id": "s1", "text": CHUNK_TEXT, "page": 1, "timestamp_ms": None, "chunk_index": 0}
    return {**base, **over}


def test_run_generate_grounds_and_cites(monkeypatch):
    from arbora_ai.generate.job import run_generate

    monkeypatch.setattr("arbora_ai.generate.job.get_provider", lambda _cfg: FakeProvider())
    job = Job(id="g1")
    run_generate(job, chunks=[_chunk()], types=["cards", "quiz", "notes"], llm_config={"provider": "ollama"})

    card = job.result["cards"][0]
    assert card["source_ref"]["source_id"] == "s1"
    assert card["source_ref"]["location"] == {"type": "page", "page": 1}
    assert EXCERPT in card["source_ref"]["excerpt"]
    assert job.result["quiz_items"][0]["answer_index"] == 0
    assert job.result["notes"][0]["format"] == "outline"
    assert job.meta["items_generated"] == 3


def test_generate_endpoints_flow(monkeypatch):
    monkeypatch.setattr("arbora_ai.generate.job.get_provider", lambda _cfg: FakeProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    body = {
        "subject_id": "subjA",
        "types": ["cards"],
        "chunks": [_chunk(), _chunk(text="Ribosomes build proteins from amino acids.", chunk_index=1)],
        "llm_config": {"provider": "ollama"},
        "preset": "low",
    }

    assert client.post("/generate", json=body).status_code == 401  # token enforced
    started = client.post("/generate", json=body, headers=auth)
    assert started.status_code == 202
    job_id = started.json()["job_id"]

    deadline = time.time() + 5
    while time.time() < deadline:
        status = client.get(f"/generate/{job_id}/status", headers=auth).json()
        assert {"state", "progress"} <= status.keys()
        if status["state"] in {"done", "error"}:
            break
        time.sleep(0.02)
    assert status["state"] == "done", status

    result = client.get(f"/generate/{job_id}/result", headers=auth).json()
    assert {"notes", "cards", "quiz_items"} <= result.keys()
    assert len(result["cards"]) >= 1
    assert result["cards"][0]["source_ref"]["location"]["type"] == "page"
