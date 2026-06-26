"""Sidecar export layer: the /export endpoint writes a real .apkg deck.

The card carries its citation (law #2/#3); we assert the file lands at the
requested path and that the token guard is enforced.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from arbora_ai.server import app


def _card(front: str = "What is osmosis?") -> dict:
    return {
        "front": front,
        "back": "Net movement of water across a semipermeable membrane.",
        "explanation": "Down its concentration gradient.",
        "source_ref": {
            "source_id": "src-1",
            "location": {"type": "page", "page": 12},
            "excerpt": "osmosis is the net movement of water",
        },
    }


def test_export_writes_apkg(monkeypatch, tmp_path):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    out = tmp_path / "deck.apkg"
    body = {"cards": [_card(), _card("Second card?")], "deck_name": "Biology", "out_path": str(out)}

    assert client.post("/export", json=body).status_code == 401  # token enforced

    resp = client.post("/export", json=body, headers=auth)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["card_count"] == 2
    assert data["path"] == str(out)
    assert out.exists() and out.stat().st_size > 0, "a real .apkg was written"


def test_export_rejects_card_without_citation(monkeypatch, tmp_path):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    auth = {"X-Arbora-Token": "secret"}
    bad = {"front": "Q", "back": "A", "explanation": ""}  # no source_ref → schema rejects
    body = {"cards": [bad], "deck_name": "Biology", "out_path": str(tmp_path / "d.apkg")}

    assert client.post("/export", json=body, headers=auth).status_code == 422
