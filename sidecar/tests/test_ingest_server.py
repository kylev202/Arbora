"""Sidecar ingest layer: job registry, the ingest worker, and the HTTP endpoints.

Parsing and embedding are monkeypatched so these stay fast and offline (no Ollama,
no real documents); FAISS is exercised for real since it's cheap on tiny vectors.
"""

from __future__ import annotations

import time

import numpy as np
from fastapi.testclient import TestClient

from arbora_ai import ingest
from arbora_ai.ingest.job import faiss_path, run_ingest
from arbora_ai.ingest.parse import SourceUnit
from arbora_ai.jobs import Job, JobRegistry
from arbora_ai.server import app

# Two pages whose text clears the chunker's min_chars floor.
_UNITS = [
    SourceUnit(text="Mitochondria are the powerhouse of the eukaryotic cell.", location={"type": "page", "page": 1}),
    SourceUnit(text="Ribosomes translate messenger RNA into polypeptide chains.", location={"type": "page", "page": 2}),
]


def _fake_embed(texts, **_kw):
    return np.zeros((len(texts), 8), dtype="float32")


def test_job_registry_runs_to_done():
    reg = JobRegistry()
    job = reg.create()

    def work(j: Job) -> None:
        j.result = 42

    reg.submit(job, work)
    _wait(lambda: reg.get(job.id).state in {"done", "error"})
    assert reg.get(job.id).state == "done"
    assert reg.get(job.id).result == 42
    assert reg.get(job.id).progress == 1.0


def test_job_registry_captures_error():
    reg = JobRegistry()
    job = reg.create()
    reg.submit(job, lambda _j: (_ for _ in ()).throw(ValueError("boom")))
    _wait(lambda: reg.get(job.id).state in {"done", "error"})
    assert reg.get(job.id).state == "error"
    assert "boom" in reg.get(job.id).error


def test_run_ingest_indexes_chunks(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.ingest.job.parse_source", lambda *a, **k: _UNITS)
    monkeypatch.setattr("arbora_ai.ingest.job.embed_texts", _fake_embed)

    job = Job(id="t1")
    run_ingest(
        job,
        source_id="src1",
        subject_id="subjA",
        file_path="ignored.pdf",
        source_type="pdf",
        data_dir=tmp_path,
    )

    assert job.meta["chunk_count"] == 2
    assert job.meta["page_count"] == 2
    assert [c["page"] for c in job.result] == [1, 2]
    assert [c["faiss_id"] for c in job.result] == [0, 1]
    assert all(c["timestamp_ms"] is None for c in job.result)
    assert faiss_path(tmp_path, "subjA").exists()


def test_empty_source_is_not_an_error(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.ingest.job.parse_source", lambda *a, **k: [])
    job = Job(id="t2")
    run_ingest(job, source_id="s", subject_id="a", file_path="x.pdf", source_type="pdf", data_dir=tmp_path)
    assert job.result == []
    assert job.meta["chunk_count"] == 0


def test_ingest_endpoints_flow_and_auth(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.ingest.job.parse_source", lambda *a, **k: _UNITS)
    monkeypatch.setattr("arbora_ai.ingest.job.embed_texts", _fake_embed)
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    monkeypatch.setenv("ARBORA_DATA_DIR", str(tmp_path))

    client = TestClient(app)
    body = {"source_id": "s1", "subject_id": "subjB", "file_path": "x.pdf", "type": "pdf"}

    # Token is enforced on everything but /health.
    assert client.get("/health").status_code == 200
    assert client.post("/ingest", json=body).status_code == 401

    auth = {"X-Arbora-Token": "secret"}
    started = client.post("/ingest", json=body, headers=auth)
    assert started.status_code == 202
    job_id = started.json()["job_id"]

    deadline = time.time() + 3
    while time.time() < deadline:
        status = client.get(f"/ingest/{job_id}/status", headers=auth).json()
        if status["state"] in {"done", "error"}:
            break
        time.sleep(0.02)
    assert status["state"] == "done", status
    assert status["chunk_count"] == 2

    result = client.get(f"/ingest/{job_id}/result", headers=auth).json()
    assert result["chunk_count"] == 2
    assert result["page_count"] == 2
    assert len(result["chunks"]) == 2


def test_ingest_module_reexports():
    # The package should expose the pipeline helpers used by the CLI/server.
    assert hasattr(ingest, "chunk_units") and hasattr(ingest, "parse_source")


def _wait(pred, timeout=3.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if pred():
            return
        time.sleep(0.01)
    raise AssertionError("condition not met within timeout")
