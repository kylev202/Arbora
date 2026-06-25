"""Build an Anki `.apkg` deck from cards (genanki).

Law #2: only **reviewed** cards should reach here. The card's citation travels
into Anki as a visible Source line, so grounding survives the export.

The model id is fixed (so re-imports update the same note type), and the deck id
is derived from the deck name (stable per subject → re-import merges, no dupes).
"""

from __future__ import annotations

import zlib
from pathlib import Path

import genanki

from ..schemas.output import CardOut, PageLocation

# Fixed model id → stable note type across exports.
_MODEL_ID = 1607392319

_MODEL = genanki.Model(
    _MODEL_ID,
    "Arbora Flashcard",
    fields=[
        {"name": "Front"},
        {"name": "Back"},
        {"name": "Explanation"},
        {"name": "Source"},
    ],
    templates=[
        {
            "name": "Card 1",
            "qfmt": "{{Front}}",
            "afmt": (
                '{{FrontSide}}<hr id="answer">{{Back}}'
                '<div class="explanation">{{Explanation}}</div>'
                '<div class="source">{{Source}}</div>'
            ),
        }
    ],
    css=(
        ".card{font-family:-apple-system,Segoe UI,sans-serif;font-size:18px;"
        "color:#2b2b28;background:#faf8f4;text-align:left;padding:16px}"
        ".explanation{color:#6b665e;font-size:15px;margin-top:12px}"
        ".source{color:#3f6076;font-size:13px;margin-top:10px}"
    ),
)


def _deck_id(name: str) -> int:
    """Deterministic 31-bit deck id from the deck name."""
    return zlib.crc32(name.encode("utf-8")) & 0x7FFFFFFF


def _format_source(card: CardOut) -> str:
    loc = card.source_ref.location
    where = f"p.{loc.page}" if isinstance(loc, PageLocation) else f"{loc.timestamp_ms // 1000}s"
    return f"📄 {card.source_ref.source_id} · {where} — “{card.source_ref.excerpt}”"


def export_apkg(cards: list[CardOut], deck_name: str, out_path: str | Path) -> Path:
    """Write `cards` to an .apkg at `out_path`. Returns the path."""
    deck = genanki.Deck(_deck_id(deck_name), deck_name)
    for card in cards:
        deck.add_note(
            genanki.Note(
                model=_MODEL,
                fields=[card.front, card.back, card.explanation, _format_source(card)],
            )
        )
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    genanki.Package(deck).write_to_file(str(out_path))
    return out_path
