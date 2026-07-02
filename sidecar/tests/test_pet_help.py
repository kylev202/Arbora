"""Domain B app-help: KB section parsing, cosine retrieval, grounded answers."""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from arbora_ai.llm.provider import LLMProvider
from arbora_ai.pet import help as pet_help
from arbora_ai.pet.help import HelpIndex, answer_app_help, load_kb_sections
from arbora_ai.server import app


class _FakeProvider(LLMProvider):
    def __init__(self, response):
        self.response = response

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1) -> dict:
        return self.response


def _fake_embed(texts, **_kw):
    # Deterministic per-text vectors so retrieval order is stable in tests.
    return np.array(
        [[float(len(t) % 7 + 1), float(len(t) % 5 + 1), 1.0] for t in texts], dtype="float32"
    )


def test_kb_parses_into_titled_sections():
    sections = load_kb_sections()
    assert len(sections) >= 15, "all help topics present"
    assert all(s.title for s in sections)
    assert all(s.text for s in sections)
    assert sections[0].index == 1
    # The pet topic documents the keyboard shortcut (kept in sync with the UI).
    pet_section = next(s for s in sections if "Pet AI" in s.title)
    assert "Ctrl+." in pet_section.text


def test_help_index_search_returns_k_sections(monkeypatch):
    monkeypatch.setattr(pet_help, "embed_texts", _fake_embed)
    index = HelpIndex()
    got = index.search("how do I add a source?", k=3)
    assert len(got) == 3
    assert all(hasattr(s, "title") for s in got)


def test_answer_app_help_maps_refs(monkeypatch):
    monkeypatch.setattr(pet_help, "embed_texts", _fake_embed)
    monkeypatch.setattr(pet_help, "_INDEX", None)  # fresh index with fake embed
    provider = _FakeProvider({"answer": "Open the Sources tab.", "used_passage_indices": [1]})
    answer, refs = answer_app_help("how do I add a document?", provider)
    assert answer == "Open the Sources tab."
    assert len(refs) == 1
    assert set(refs[0]) == {"section", "title", "excerpt"}


def test_pet_help_endpoint(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    monkeypatch.setattr(
        "arbora_ai.server.answer_app_help",
        lambda q, p: ("Use the + button.", [{"section": 4, "title": "Thêm tài liệu", "excerpt": "…"}]),
    )
    client = TestClient(app)
    assert client.post("/pet/help", json={"question": "q"}).status_code == 401
    resp = client.post(
        "/pet/help", json={"question": "how do I add a file?"}, headers={"X-Arbora-Token": "secret"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["answer"] == "Use the + button."
    assert body["refs"][0]["section"] == 4
