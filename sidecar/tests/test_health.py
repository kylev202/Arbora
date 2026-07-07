from fastapi.testclient import TestClient

from arbora_ai.server import create_app


def test_health_ok():
    client = TestClient(create_app())
    resp = client.get("/health")
    assert resp.status_code == 200

    body = resp.json()
    assert body["status"] == "ok"
    assert body["version"]
    # Models load lazily, so they report not-loaded at startup.
    assert body["model_loaded"] is False
    assert body["whisper_loaded"] is False


def test_guarded_endpoints_fail_closed_without_configured_token(monkeypatch):
    # No ARBORA_SIDECAR_TOKEN in the environment → guarded endpoints refuse
    # everything (503), even requests that guess a header. Only /health is open.
    monkeypatch.delenv("ARBORA_SIDECAR_TOKEN", raising=False)
    client = TestClient(create_app())

    resp = client.get("/model/low/ready", headers={"X-Arbora-Token": "guess"})
    assert resp.status_code == 503

    assert client.get("/health").status_code == 200
