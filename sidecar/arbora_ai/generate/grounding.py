"""Semantic grounding checks (law #1) — run AFTER Pydantic, never retried.

An item that fails any check is **dropped**, not fixed and not retried: the whole
batch must not fail, but an untraceable item must never be trusted. The citation
source_id/location is taken authoritatively from the chunk we generated from; the
model-supplied *excerpt* is verified to be a real (verbatim) substring of it.
On top of the excerpt check, two lexical gates catch the failure modes the
excerpt alone can't: answers pulled from the model's own knowledge instead of
the passage (`answer_supported`), and items that lean on the generation context
("according to the passage…") and are useless on their own (`refers_to_source`).
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


# Content that names the generation context instead of standing alone. Kept
# conservative (no bare "the text"/"the author" — legitimate in humanities
# subjects); the prompts already forbid these, this is the enforcement net.
_META = re.compile(
    r"according to (the|this) (passage|text|excerpt|source)"
    r"|\b(the|this) passage\b"
    r"|\b(the|this) excerpt\b"
    r"|\bthe (provided|given) (text|source|material)\b"
    r"|\bin the (text|source) above\b",
    re.IGNORECASE,
)


def refers_to_source(text: str) -> bool:
    """True when the text leans on the passage instead of standing alone
    ("according to the passage…") — useless outside the generation context."""
    return bool(_META.search(text))


_WORDTOK = re.compile(r"[a-z0-9]+")

# Glue words that carry no factual content — excluded from support matching.
_SUPPORT_STOP = frozenset(
    "a an and are as at be because but by for from has have in into is it its of "
    "on or than that the their there these this to was were which with".split()
)


def _support_tokens(text: str) -> list[str]:
    return [
        t
        for t in _WORDTOK.findall(text.lower())
        if t not in _SUPPORT_STOP and (len(t) >= 3 or t.isdigit())
    ]


def answer_supported(answer: str, chunk_text: str) -> bool:
    """Lexical support: enough of the answer's content words appear in the
    chunk (5-char prefixes tolerate light inflection, vibrates/vibration).
    Short answers (≤2 content words) must match fully; longer, possibly
    paraphrased ones need half. A safety net under the prompt's grounding
    rules — catches answers the model pulled from its own knowledge."""
    tokens = _support_tokens(answer)
    if not tokens:
        return True  # nothing checkable (symbols/stopwords only)
    chunk_tokens = set(_support_tokens(chunk_text))
    prefixes = {t[:5] for t in chunk_tokens if len(t) >= 5}
    hits = sum(
        1 for t in tokens if t in chunk_tokens or (len(t) >= 5 and t[:5] in prefixes)
    )
    if len(tokens) <= 2:
        return hits == len(tokens)
    return hits / len(tokens) >= 0.5


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
    if refers_to_source(card.front) or refers_to_source(card.back):
        return "refers to the source material"
    if not answer_supported(card.back, chunk.text):
        return "answer not supported by the passage"
    return None


def check_quiz(quiz: QuizItemOut, chunk: Chunk) -> str | None:
    if not excerpt_grounded(quiz.source_ref.excerpt, chunk.text):
        return "excerpt not found verbatim in source"
    if len({normalize(o) for o in quiz.options}) < 4:
        return "options not distinct"
    if refers_to_source(quiz.question):
        return "refers to the source material"
    if not answer_supported(quiz.options[quiz.answer_index], chunk.text):
        return "correct option not supported by the passage"
    return None


def check_note(note: NoteOut, chunk: Chunk) -> str | None:
    if not any(excerpt_grounded(r.excerpt, chunk.text) for r in note.source_refs):
        return "no excerpt found verbatim in source"
    return None
