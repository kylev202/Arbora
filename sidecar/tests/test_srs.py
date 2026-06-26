"""Tests for the FSRS /schedule endpoint and compute_next helper."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from arbora_ai.server import app
from arbora_ai.srs import compute_next

TOKEN = "test-token"
HEADERS = {"X-Arbora-Token": TOKEN}


@pytest.fixture(autouse=True)
def _set_token(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", TOKEN)


client = TestClient(app)


# ── compute_next unit tests ────────────────────────────────────────────────


def test_new_card_good_advances_to_learning_step1():
    result = compute_next(
        state="learning",
        stability=0.0,
        difficulty=0.0,
        step=0,
        last_review=None,
        due=None,
        rating="good",
    )
    assert result["state"] == "learning"
    assert result["step"] == 1
    assert result["stability"] > 0
    assert result["difficulty"] > 0
    assert result["last_review"] is not None


def test_new_card_easy_graduates_to_review():
    result = compute_next(
        state="learning",
        stability=0.0,
        difficulty=0.0,
        step=0,
        last_review=None,
        due=None,
        rating="easy",
    )
    assert result["state"] == "review"
    assert result["step"] is None
    assert result["stability"] > 0


def test_new_card_again_stays_learning():
    result = compute_next(
        state="learning",
        stability=0.0,
        difficulty=0.0,
        step=0,
        last_review=None,
        due=None,
        rating="again",
    )
    assert result["state"] == "learning"
    assert result["stability"] > 0


def test_legacy_state_new_treated_as_learning():
    """Cards approved before the migration have state='new'; must not crash."""
    result = compute_next(
        state="new",
        stability=0.0,
        difficulty=0.0,
        step=0,
        last_review=None,
        due=None,
        rating="good",
    )
    assert result["state"] in ("learning", "review")


def test_review_card_again_moves_to_relearning():
    result = compute_next(
        state="review",
        stability=10.0,
        difficulty=5.0,
        step=None,
        last_review="2026-01-01T00:00:00Z",
        due="2026-01-11T00:00:00Z",
        rating="again",
    )
    assert result["state"] == "relearning"


def test_all_ratings_produce_valid_output():
    for rating in ("again", "hard", "good", "easy"):
        result = compute_next(
            state="learning",
            stability=0.0,
            difficulty=0.0,
            step=0,
            last_review=None,
            due=None,
            rating=rating,
        )
        assert result["state"] in ("learning", "review", "relearning")
        assert "due" in result
        assert "stability" in result
        assert "difficulty" in result
        assert "last_review" in result


# ── /schedule HTTP endpoint tests ─────────────────────────────────────────


def test_schedule_endpoint_returns_200():
    resp = client.post(
        "/schedule",
        headers=HEADERS,
        json={
            "state": "learning",
            "stability": 0.0,
            "difficulty": 0.0,
            "step": 0,
            "rating": "good",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] in ("learning", "review")
    assert body["stability"] > 0
    assert body["due"]


def test_schedule_endpoint_requires_token():
    resp = client.post(
        "/schedule",
        json={"state": "learning", "stability": 0, "difficulty": 0, "step": 0, "rating": "good"},
    )
    assert resp.status_code == 401


def test_schedule_endpoint_rejects_bad_rating():
    resp = client.post(
        "/schedule",
        headers=HEADERS,
        json={
            "state": "learning",
            "stability": 0.0,
            "difficulty": 0.0,
            "step": 0,
            "rating": "INVALID",
        },
    )
    assert resp.status_code == 422  # Pydantic Literal validation rejects it
