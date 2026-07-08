"""The /parse-assignment-spec and /parse-rubric endpoints: token-guarded,
synchronous extraction, mirroring test_outline_server.py."""

from __future__ import annotations

from fastapi.testclient import TestClient

from arbora_ai.server import app

SPEC_TEXT = "Assignment 1: Cell Report\nDue 2026-03-15 via Turnitin.\n"


class FakeProvider:
    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        if schema and "criteria" in schema.get("properties", {}):
            return {"criteria": [{"name": "Accuracy", "weight_text": "40%", "levels": []}]}
        return {
            "overview": "A report.",
            "due_date": "2026-03-15",
            "requirements": ["2000-word report"],
            "process_steps": ["Submit via Turnitin"],
            "plan_steps": ["Draft", "Submit"],
        }


def _write_spec(tmp_path) -> str:
    f = tmp_path / "assignment.txt"
    f.write_text(SPEC_TEXT, encoding="utf-8")
    return str(f)


def test_parse_assignment_spec_flow(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.server.get_provider", lambda _cfg: FakeProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    body = {
        "subject_id": "s1",
        "file_path": _write_spec(tmp_path),
        "assignment_title": "Assignment 1",
        "preset": "low",
    }

    assert client.post("/parse-assignment-spec", json=body).status_code == 401  # token enforced

    res = client.post("/parse-assignment-spec", json=body, headers=auth)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["due_date"] == "2026-03-15"
    assert data["plan_steps"] == ["Draft", "Submit"]


def test_parse_rubric_flow(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.server.get_provider", lambda _cfg: FakeProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    body = {"subject_id": "s1", "file_path": _write_spec(tmp_path)}

    assert client.post("/parse-rubric", json=body).status_code == 401

    res = client.post("/parse-rubric", json=body, headers=auth)
    assert res.status_code == 200, res.text
    assert res.json()["criteria"][0]["name"] == "Accuracy"


def test_parse_assignment_rejects_unsupported_file(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.server.get_provider", lambda _cfg: FakeProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    bad = tmp_path / "spec.csv"
    bad.write_text("a,b", encoding="utf-8")

    res = client.post(
        "/parse-assignment-spec",
        json={"subject_id": "s1", "file_path": str(bad)},
        headers=auth,
    )
    assert res.status_code == 400
    assert "unsupported" in res.json()["detail"]
