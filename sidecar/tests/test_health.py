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
