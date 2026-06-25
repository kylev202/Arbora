"""Semantic grounding checks (law #1) — run AFTER Pydantic, never retried.

An item that fails any check is **dropped**, not fixed and not retried: the whole
batch must not fail, but an untraceable item must never be trusted. The citation
source_id/location is taken authoritatively from the chunk we generated from; the
model-supplied *excerpt* is verified to be a real (verbatim) substring of it.
"""

from __future__ import annotations

import re

from ..ingest.chunk import Chunk
from ..schemas.output import CardOut, NoteOut, PageLocation, QuizItemOut, TimestampLocation

_WS = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Lowercase + collapse whitespace, for tolerant substring matching."""
    return _WS.sub(" ", text).strip().lower()


def excerpt_grounded(excerpt: str, chunk_text: str) -> bool:
    """True iff the excerpt appears verbatim (whitespace/case-insensitive)."""
    e = normalize(excerpt)
    return len(e) >= 3 and e in normalize(chunk_text)


def location_from_chunk(chunk: Chunk) -> PageLocation | TimestampLocation:
    loc = chunk.location
    if loc.get("type") == "timestamp":
        return TimestampLocation(timestamp_ms=int(loc["timestamp_ms"]))
    return PageLocation(page=int(loc["page"]))


def check_card(card: CardOut, chunk: Chunk) -> str | None:
    """Return a drop-reason, or None if the card is grounded and well-formed."""
    if not excerpt_grounded(card.source_ref.excerpt, chunk.text):
        return "excerpt not found verbatim in source"
    if normalize(card.front) == normalize(card.back):
        return "front equals back"
    return None


def check_quiz(quiz: QuizItemOut, chunk: Chunk) -> str | None:
    if not excerpt_grounded(quiz.source_ref.excerpt, chunk.text):
        return "excerpt not found verbatim in source"
    if len({normalize(o) for o in quiz.options}) < 4:
        return "options not distinct"
    return None


def check_note(note: NoteOut, chunk: Chunk) -> str | None:
    if not any(excerpt_grounded(r.excerpt, chunk.text) for r in note.source_refs):
        return "no excerpt found verbatim in source"
    return None
