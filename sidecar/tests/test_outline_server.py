"""The /parse-outline endpoint: token-guarded synchronous extraction.

A fake provider stands in for Ollama; a temp .txt file stands in for an uploaded
syllabus. Asserts the auth gate, the happy path, and the unsupported-file error.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from arbora_ai.server import app

SYLLABUS = "Week 1: Cells\nWeek 2: Membranes\nFinal exam 2026-06-20\n"


class FakeProvider:
    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        return {
            "weeks": [
                {"week_number": 1, "title": "Cells", "summary": ""},
                {"week_number": 2, "title": "Membranes", "summary": ""},
            ],
            "deadlines": [{"title": "Final exam", "due_date": "2026-06-20", "type": "exam"}],
        }


def _write_syllabus(tmp_path) -> str:
    f = tmp_path / "syllabus.txt"
    f.write_text(SYLLABUS, encoding="utf-8")
    return str(f)


def test_parse_outline_flow(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.server.get_provider", lambda _cfg: FakeProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    body = {"subject_id": "s1", "file_path": _write_syllabus(tmp_path), "preset": "low"}

    assert client.post("/parse-outline", json=body).status_code == 401  # token enforced

    res = client.post("/parse-outline", json=body, headers=auth)
    assert res.status_code == 200, res.text
    data = res.json()
    assert [w["week_number"] for w in data["weeks"]] == [1, 2]
    assert data["deadlines"][0]["type"] == "exam"


def test_parse_outline_rejects_unsupported_file(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.server.get_provider", lambda _cfg: FakeProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    bad = tmp_path / "syllabus.csv"
    bad.write_text("week,topic\n1,cells", encoding="utf-8")

    res = client.post(
        "/parse-outline",
        json={"subject_id": "s1", "file_path": str(bad)},
        headers=auth,
    )
    assert res.status_code == 400
    assert "unsupported" in res.json()["detail"]
