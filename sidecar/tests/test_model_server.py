"""Ollama model management: readiness check, pull-with-progress, HTTP endpoints.

The ollama client is faked so everything runs offline (no daemon, no download).
"""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from arbora_ai.jobs import Job
from arbora_ai.llm.models import model_ready, pull_model
from arbora_ai.server import app


class _FakeClient:
    """Stands in for ollama.Client; behavior driven by class attributes."""

    listing: dict = {"models": []}
    pull_parts: list[dict] = []
    raise_on: str | None = None  # "list" | "pull"

    def __init__(self, host: str):
        self.host = host

    def list(self):
        if self.raise_on == "list":
            raise ConnectionError("daemon down")
        return self.listing

    def pull(self, model, stream=False):
        if self.raise_on == "pull":
            raise RuntimeError("no space left on device")
        assert stream
        return iter(self.pull_parts)


def _use_fake(monkeypatch, **attrs):
    for k, v in attrs.items():
        setattr(_FakeClient, k, v)
    monkeypatch.setattr("arbora_ai.llm.models.ollama.Client", _FakeClient)


def test_model_ready_states(monkeypatch):
    # Pulled: exact model name present in the daemon's list.
    _use_fake(monkeypatch, listing={"models": [{"model": "qwen3:8b"}]}, raise_on=None)
    assert model_ready("medium") == {"model": "qwen3:8b", "ready": True, "ollama_running": True}

    # Not pulled yet: daemon up, model absent.
    assert model_ready("high") == {"model": "qwen3:14b", "ready": False, "ollama_running": True}

    # Daemon unreachable is reported distinctly from "not downloaded".
    _use_fake(monkeypatch, raise_on="list")
    assert model_ready("low") == {"model": "qwen3:4b", "ready": False, "ollama_running": False}


def test_pull_model_streams_progress(monkeypatch):
    _use_fake(
        monkeypatch,
        raise_on=None,
        pull_parts=[
            {"status": "pulling manifest"},
            {"status": "pulling blob", "total": 100, "completed": 50},
            {"status": "pulling blob", "total": 100, "completed": 100},
            {"status": "success"},
        ],
    )
    job = Job(id="p1")
    pull_model(job, "low")
    assert job.step == "success"
    assert job.progress == 0.99, "held below 1.0 until the registry marks done"


def test_model_endpoints_flow_and_auth(monkeypatch):
    _use_fake(
        monkeypatch,
        raise_on=None,
        listing={"models": []},
        pull_parts=[{"status": "pulling blob", "total": 10, "completed": 10}],
    )
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}

    # Token enforced.
    assert client.get("/model/low/ready").status_code == 401

    ready = client.get("/model/low/ready", headers=auth)
    assert ready.status_code == 200
    assert ready.json() == {"model": "qwen3:4b", "ready": False, "ollama_running": True}

    started = client.post("/model/pull", json={"preset": "low"}, headers=auth)
    assert started.status_code == 202
    job_id = started.json()["job_id"]

    deadline = time.time() + 3
    while time.time() < deadline:
        status = client.get(f"/model/pull/{job_id}/status", headers=auth).json()
        if status["state"] in {"done", "error"}:
            break
        time.sleep(0.02)
    assert status["state"] == "done", status
    assert status["progress"] == 1.0

    assert client.get("/model/pull/nope/status", headers=auth).status_code == 404


def test_model_pull_failure_surfaces_error(monkeypatch):
    _use_fake(monkeypatch, raise_on="pull")
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}

    job_id = client.post("/model/pull", json={"preset": "low"}, headers=auth).json()["job_id"]
    deadline = time.time() + 3
    while time.time() < deadline:
        status = client.get(f"/model/pull/{job_id}/status", headers=auth).json()
        if status["state"] in {"done", "error"}:
            break
        time.sleep(0.02)
    assert status["state"] == "error"
    assert "no space left" in status["error"]
