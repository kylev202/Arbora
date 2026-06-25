"""Chunk located units into retrieval/generation-sized pieces.

Each chunk inherits its unit's location, so the citation back-mapping is exact:
an item generated from a chunk cites that chunk's page/timestamp.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .parse import SourceUnit

# Sentence-ish boundary: split on terminators but keep them attached.
_SENT = re.compile(r"(?<=[.!?])\s+")


@dataclass
class Chunk:
    source_id: str
    text: str
    location: dict
    index: int


def _split_text(text: str, max_chars: int) -> list[str]:
    """Greedy pack sentences into <= max_chars pieces (no mid-sentence cuts)."""
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    pieces: list[str] = []
    current = ""
    for sentence in _SENT.split(text):
        if not sentence:
            continue
        if current and len(current) + 1 + len(sentence) > max_chars:
            pieces.append(current.strip())
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


def chunk_units(
    units: list[SourceUnit],
    source_id: str,
    max_chars: int = 700,
    min_chars: int = 40,
) -> list[Chunk]:
    """Turn located units into chunks. Units shorter than a sentence-ish floor
    are kept whole; long ones are split on sentence boundaries. Tiny fragments
    (< min_chars, e.g. a slide title alone) are dropped — too little to ground a
    useful item."""
    chunks: list[Chunk] = []
    idx = 0
    for unit in units:
        for piece in _split_text(unit.text, max_chars):
            if len(piece) < min_chars:
                continue
            chunks.append(Chunk(source_id=source_id, text=piece, location=unit.location, index=idx))
            idx += 1
    return chunks
