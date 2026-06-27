"""The /assignment-brief endpoints: token-guarded grounded job, like /generate."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from arbora_ai.server import app

CHUNK_TEXT = "Photosynthesis converts light energy into chemical energy in the chloroplasts."
EXCERPT = "converts light energy into chemical energy"


class FakeProvider:
    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        return {"point": "Review how light becomes chemical energy.", "excerpt": EXCERPT}


def _chunk(**over):
    base = {"source_id": "s1", "text": CHUNK_TEXT, "page": 1, "timestamp_ms": None, "chunk_index": 0}
    return {**base, **over}


def test_assignment_brief_flow(monkeypatch):
    monkeypatch.setattr("arbora_ai.generate.job.get_provider", lambda _cfg: FakeProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    body = {
        "subject_id": "s1",
        "deadline_id": "d1",
        "assignment_title": "Bio essay",
        "chunks": [_chunk()],
        "llm_config": {"provider": "ollama"},
        "preset": "low",
    }

    assert client.post("/assignment-brief", json=body).status_code == 401  # token enforced
    started = client.post("/assignment-brief", json=body, headers=auth)
    assert started.status_code == 202
    job_id = started.json()["job_id"]

    deadline = time.time() + 5
    while time.time() < deadline:
        status = client.get(f"/assignment-brief/{job_id}/status", headers=auth).json()
        if status["state"] in {"done", "error"}:
            break
        time.sleep(0.02)
    assert status["state"] == "done", status

    result = client.get(f"/assignment-brief/{job_id}/result", headers=auth).json()
    assert "light" in result["content"]
    assert len(result["source_refs"]) == 1
    ref = result["source_refs"][0]
    assert ref["source_id"] == "s1"
    assert ref["location"] == {"type": "page", "page": 1}
    assert EXCERPT in ref["excerpt"]
