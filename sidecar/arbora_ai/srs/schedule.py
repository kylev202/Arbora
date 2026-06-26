"""Stateless FSRS next-state computation (fsrs 6.x Scheduler API).

Receives the current card_schedule row values + a rating, returns the
updated row values to persist. Uses the fsrs library; never hand-rolled.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fsrs import Card, Rating, Scheduler, State

_scheduler = Scheduler()

# DB state strings → fsrs State integer values (no State.New in v6)
_TO_STATE_VALUE: dict[str, int] = {
    "new": State.Learning.value,        # legacy sentinel: treat as fresh Learning
    "learning": State.Learning.value,
    "review": State.Review.value,
    "relearning": State.Relearning.value,
}

_FROM_STATE: dict[State, str] = {
    State.Learning: "learning",
    State.Review: "review",
    State.Relearning: "relearning",
}

_TO_RATING: dict[str, Rating] = {
    "again": Rating.Again,
    "hard": Rating.Hard,
    "good": Rating.Good,
    "easy": Rating.Easy,
}


def compute_next(
    *,
    state: str,
    stability: float,
    difficulty: float,
    step: Optional[int],
    last_review: Optional[str],
    due: Optional[str],
    rating: str,
) -> dict:
    """Return updated card_schedule fields after a review.

    stability=0.0 is the DB sentinel for "not yet computed" (Card was just
    approved, never rated). Card.from_dict treats 0.0 as falsy → None, which
    is the correct fsrs 6.x initial state.

    All datetime strings must be ISO-8601 UTC (trailing 'Z' or '+00:00').
    """
    now = datetime.now(timezone.utc)

    last_review_dt: Optional[str] = None
    if last_review:
        last_review_dt = last_review.replace("Z", "+00:00")

    due_str = now.isoformat()
    if due:
        due_str = due.replace("Z", "+00:00")

    # Reconstruct the fsrs Card from stored row values.
    # from_dict treats stability=0.0 and difficulty=0.0 as None (per its
    # `if source_dict["stability"]` guard), which matches an unreviewed card.
    card = Card.from_dict(
        {
            "card_id": 0,
            "state": _TO_STATE_VALUE.get(state, State.Learning.value),
            "step": step,
            "stability": stability,
            "difficulty": difficulty,
            "due": due_str,
            "last_review": last_review_dt,
        }
    )

    new_card, _ = _scheduler.review_card(card, _TO_RATING[rating])

    return {
        "due": new_card.due.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stability": new_card.stability,
        "difficulty": new_card.difficulty,
        "state": _FROM_STATE[new_card.state],
        "step": new_card.step,
        "last_review": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
