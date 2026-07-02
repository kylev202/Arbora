"""Pet domain router: classification, retry, and the /pet/route endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from arbora_ai.llm.provider import LLMProvider, LLMSchemaError, LLMUnavailableError
from arbora_ai.pet.router import route_question
from arbora_ai.server import app


class _FakeProvider(LLMProvider):
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1) -> dict:
        self.calls += 1
        resp = self.responses.pop(0)
        if isinstance(resp, Exception):
            raise resp
        return resp


def test_route_classifies_each_domain():
    for domain in ("lesson", "app_help", "out_of_scope"):
        provider = _FakeProvider([{"domain": domain}])
        assert route_question("q", provider) == domain


def test_route_retries_bad_output_then_succeeds():
    provider = _FakeProvider([{"domain": "weather"}, {"domain": "lesson"}])
    assert route_question("what is osmosis?", provider) == "lesson"
    assert provider.calls == 2


def test_route_gives_up_after_retries():
    provider = _FakeProvider([LLMSchemaError("bad")] * 3)
    try:
        route_question("q", provider)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_pet_route_endpoint(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    monkeypatch.setattr("arbora_ai.server.route_question", lambda q, p: "app_help")
    client = TestClient(app)

    assert client.post("/pet/route", json={"question": "hi"}).status_code == 401
    resp = client.post(
        "/pet/route", json={"question": "how do I add a source?"}, headers={"X-Arbora-Token": "secret"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"domain": "app_help"}


def test_pet_route_unavailable_maps_to_503(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")

    def _boom(q, p):
        raise LLMUnavailableError("connection refused")

    monkeypatch.setattr("arbora_ai.server.route_question", _boom)
    client = TestClient(app)
    resp = client.post(
        "/pet/route", json={"question": "q"}, headers={"X-Arbora-Token": "secret"}
    )
    assert resp.status_code == 503


def test_model_warmup_endpoint(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    called: list[str] = []
    monkeypatch.setattr("arbora_ai.server.warmup_model", lambda preset: called.append(preset))
    client = TestClient(app)
    resp = client.post(
        "/model/warmup", json={"preset": "low"}, headers={"X-Arbora-Token": "secret"}
    )
    assert resp.status_code == 202
    import time

    deadline = time.time() + 2
    while time.time() < deadline and not called:
        time.sleep(0.02)
    assert called == ["low"]
