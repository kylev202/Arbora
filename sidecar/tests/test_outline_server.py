"""The /parse-outline and /parse-unit-plan endpoints: token-guarded synchronous
extraction.

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
        if schema and "unit_code" in schema.get("properties", {}):
            return {"unit_code": "BIOL101", "classes": [], "assessments": []}
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
    assert data["unit_info"]["unit_code"] == "BIOL101"
    assert data["unit_info"]["coordinator_name"] == ""  # defaulted, never invented


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


class FakePlanProvider:
    """Answers the three deep-plan passes; the week pass echoes its batch."""

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        props = (schema or {}).get("properties", {})
        if "aim" in props:
            return {
                "aim": "Understand the cell.",
                "outcomes": [{"code": "ULO1", "text": "Describe cell structure"}],
                "staff": [{"name": "Dr Ada Chen", "role": "Coordinator"}],
            }
        if "assessments" in props:
            return {
                "assessments": [
                    {"name": "Final exam", "weight_percent": 50, "kind": "Individual"}
                ]
            }
        return {
            "weeks": [
                {"week_number": n, "lecture": f"Topic {n}", "focus": [f"Explain topic {n}"]}
                for n in range(1, 54)
                if f"- Week {n}: " in prompt
            ]
        }


def test_parse_unit_plan_flow(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.server.get_provider", lambda _cfg: FakePlanProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    body = {
        "subject_id": "s1",
        "file_path": _write_syllabus(tmp_path),
        "weeks": [{"week_number": 1, "title": "Cells"}, {"week_number": 2, "title": "Membranes"}],
        "preset": "low",
    }

    assert client.post("/parse-unit-plan", json=body).status_code == 401  # token enforced

    res = client.post("/parse-unit-plan", json=body, headers=auth)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["essentials"]["outcomes"][0]["code"] == "ULO1"
    assert data["essentials"]["credit_points"] == ""  # defaulted, never invented
    assert data["assessments"][0]["weight_percent"] == 50
    assert [w["week_number"] for w in data["week_details"]] == [1, 2]


def test_parse_unit_plan_rejects_unsupported_file(monkeypatch, tmp_path):
    monkeypatch.setattr("arbora_ai.server.get_provider", lambda _cfg: FakePlanProvider())
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    bad = tmp_path / "syllabus.csv"
    bad.write_text("week,topic\n1,cells", encoding="utf-8")

    res = client.post(
        "/parse-unit-plan",
        json={"subject_id": "s1", "file_path": str(bad)},
        headers={"X-Arbora-Token": "secret"},
    )
    assert res.status_code == 400
