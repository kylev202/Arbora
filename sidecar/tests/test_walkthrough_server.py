"""/walkthrough endpoints: job lifecycle + token guard, with the LLM faked out."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

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
        status = client.get(f"/walkthrough/{job_id}/status", headers=AUTH).json()
        if status["state"] in ("done", "error"):
            return status
        time.sleep(0.02)
    raise AssertionError("job never finished")


def test_walkthrough_requires_token(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    body = {"subject_id": "s1", "week_id": "w1", "chunks": [_chunk()]}
    assert client.post("/walkthrough", json=body).status_code == 401


def test_walkthrough_job_returns_overview_and_lessons(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")

    def fake_run(job, *, chunks, week_title, llm_config, discipline="general", **_):
        job.result = {
            "overview": "Sound is transmitted through the ear.",
            "overview_refs": [
                {
                    "source_id": "src-1",
                    "location": {"type": "page", "page": 3},
                    "excerpt": "the eardrum vibrates",
                }
            ],
            "lessons": [
                {
                    "title": "The eardrum",
                    "content": "How the eardrum passes sound along.",
                    "source_refs": [
                        {
                            "source_id": "src-1",
                            "location": {"type": "page", "page": 3},
                            "excerpt": "transmit sound waves",
                        }
                    ],
                    "chunk_refs": [{"source_id": "src-1", "chunk_index": 0}],
                }
            ],
        }
        job.meta["items_generated"] = 2

    monkeypatch.setattr("arbora_ai.server.run_walkthrough", fake_run)
    client = TestClient(app)
    body = {"subject_id": "s1", "week_id": "w1", "week_title": "Hearing", "chunks": [_chunk()]}

    resp = client.post("/walkthrough", json=body, headers=AUTH)
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    status = _wait_done(client, job_id)
    assert status["state"] == "done"
    assert status["items_generated"] == 2

    result = client.get(f"/walkthrough/{job_id}/result", headers=AUTH).json()
    assert result["overview"].startswith("Sound")
    assert result["lessons"][0]["chunk_refs"] == [{"source_id": "src-1", "chunk_index": 0}]


def test_walkthrough_error_surfaces(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")

    def fake_run(job, *, chunks, week_title, llm_config, discipline="general", **_):
        raise ValueError("NO_OVERVIEW: overview could not be grounded in the material")

    monkeypatch.setattr("arbora_ai.server.run_walkthrough", fake_run)
    client = TestClient(app)
    body = {"subject_id": "s1", "week_id": "w1", "chunks": [_chunk()]}

    job_id = client.post("/walkthrough", json=body, headers=AUTH).json()["job_id"]
    status = _wait_done(client, job_id)
    assert status["state"] == "error"
    assert "NO_OVERVIEW" in status["error"]
