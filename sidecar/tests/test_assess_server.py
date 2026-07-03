"""/test/generate + /test/grade endpoints: job lifecycle, token guard, and the
grading passthrough — with the LLM faked out (no Ollama needed)."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from arbora_ai.schemas.output import GradeGen
from arbora_ai.server import app

AUTH = {"X-Arbora-Token": "secret"}


def _chunk() -> dict:
    return {
        "source_id": "src-1",
        "text": "the eardrum vibrates to transmit sound waves",
        "page": 3,
        "timestamp_ms": None,
        "chunk_index": 0,
    }


def _wait_done(client: TestClient, job_id: str, timeout: float = 5.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = client.get(f"/test/generate/{job_id}/status", headers=AUTH).json()
        if status["state"] in ("done", "error"):
            return status
        time.sleep(0.02)
    raise AssertionError("job never finished")


def test_generate_requires_token(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    body = {"subject_id": "s1", "types": ["short_answer"], "chunks": [_chunk()]}
    assert client.post("/test/generate", json=body).status_code == 401


def test_generate_job_returns_cited_items(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")

    def fake_run(job, *, chunks, types, count_per_type, llm_config):
        job.result = {
            "items": [
                {
                    "kind": "short_answer",
                    "question": "What vibrates?",
                    "expected_answer": "The eardrum",
                    "source_ref": {
                        "source_id": "src-1",
                        "location": {"type": "page", "page": 3},
                        "excerpt": "the eardrum vibrates",
                    },
                }
            ]
        }
        job.meta["items_generated"] = 1

    monkeypatch.setattr("arbora_ai.server.run_test_generate", fake_run)
    client = TestClient(app)
    body = {"subject_id": "s1", "types": ["short_answer"], "chunks": [_chunk()]}

    resp = client.post("/test/generate", json=body, headers=AUTH)
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    status = _wait_done(client, job_id)
    assert status["state"] == "done"
    assert status["items_generated"] == 1

    result = client.get(f"/test/generate/{job_id}/result", headers=AUTH).json()
    assert result["items"][0]["kind"] == "short_answer"
    assert result["items"][0]["source_ref"]["source_id"] == "src-1"


def test_grade_passthrough(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    monkeypatch.setattr(
        "arbora_ai.server.grade_answer",
        lambda provider, q, e, a: GradeGen(verdict="correct", feedback="Spot on."),
    )
    client = TestClient(app)
    body = {"question": "What vibrates?", "expected": "The eardrum", "user_answer": "eardrum"}

    assert client.post("/test/grade", json=body).status_code == 401
    resp = client.post("/test/grade", json=body, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == {"verdict": "correct", "feedback": "Spot on."}
