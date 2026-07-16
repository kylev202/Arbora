"""Chunk located units into retrieval/generation-sized pieces.

Each chunk inherits its unit's location, so the citation back-mapping is exact:
an item generated from a chunk cites that chunk's page/timestamp.

Splitting is structure-aware: a unit is first split on blank lines and packed
paragraph-by-paragraph (a paragraph is usually one idea — keeping it whole
grounds better items than an arbitrary character cut). Only an oversized
paragraph falls back to sentence packing, and there consecutive pieces share a
one-sentence overlap so an idea straddling the cut is still retrievable from
either side. Overlap lives *within* the max_chars budget — no piece ever
exceeds it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .parse import SourceUnit

# Sentence-ish boundary: split on terminators but keep them attached.
_SENT = re.compile(r"(?<=[.!?])\s+")
# Paragraph boundary: one or more blank lines.
_PARA = re.compile(r"\n\s*\n+")

# Longest tail sentence carried into the next piece as overlap.
_OVERLAP_CHARS = 150


@dataclass
class Chunk:
    source_id: str
    text: str
    location: dict
    index: int


def _overlap_tail(piece: str) -> str:
    """The piece's last sentence, if short enough to serve as overlap."""
    sentences = _SENT.split(piece)
    tail = sentences[-1].strip() if sentences else ""
    if not tail or len(tail) > _OVERLAP_CHARS or tail == piece:
        return ""
    return tail


def _split_sentences(text: str, max_chars: int) -> list[str]:
    """Greedy pack sentences into <= max_chars pieces (no mid-sentence cuts),
    seeding each piece with the previous piece's last sentence for continuity."""
    pieces: list[str] = []
    current = ""
    for sentence in _SENT.split(text):
        if not sentence:
            continue
        if current and len(current) + 1 + len(sentence) > max_chars:
            pieces.append(current.strip())
            tail = _overlap_tail(current)
            if tail and len(tail) + 1 + len(sentence) <= max_chars:
                current = f"{tail} {sentence}"
            else:
                current = sentence
        else:
            current = f"{current} {sentence}".strip()
        # A single oversized sentence still becomes its own chunk.
        while len(current) > max_chars:
            pieces.append(current[:max_chars].strip())
            current = current[max_chars:].strip()
    if current:
        pieces.append(current.strip())
    return [p for p in pieces if p]


def _split_text(text: str, max_chars: int) -> list[str]:
    """Split a unit: whole if it fits, else pack paragraphs, sentence-splitting
    only the paragraphs that don't fit on their own."""
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    pieces: list[str] = []
    current = ""
    for para in (p.strip() for p in _PARA.split(text)):
        if not para:
            continue
        if len(para) > max_chars:
            if current:
                pieces.append(current)
                current = ""
            pieces.extend(_split_sentences(para, max_chars))
        elif current and len(current) + 2 + len(para) > max_chars:
            pieces.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        pieces.append(current)
    return [p for p in pieces if p]


def chunk_units(
    units: list[SourceUnit],
    source_id: str,
    max_chars: int = 700,
    min_chars: int = 40,
) -> list[Chunk]:
    """Turn located units into chunks. Units shorter than a sentence-ish floor
    are kept whole; long ones are split paragraph-first, then on sentence
    boundaries. Tiny fragments (< min_chars, e.g. a slide title alone) are
    dropped — too little to ground a useful item."""
    chunks: list[Chunk] = []
    idx = 0
    for unit in units:
        for piece in _split_text(unit.text, max_chars):
            if len(piece) < min_chars:
                continue
            chunks.append(Chunk(source_id=source_id, text=piece, location=unit.location, index=idx))
            idx += 1
    return chunks
