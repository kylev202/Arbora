"""Ingest: parse a source document into located text units, then chunk them.

Every chunk keeps the location (page for pdf/slide, timestamp for audio) it came
from, so any item generated from it can carry a traceable citation (law #3).
"""

from .chunk import Chunk, chunk_units
from .parse import SourceUnit, parse_audio, parse_pdf, parse_pptx, parse_source

__all__ = [
    "Chunk",
    "SourceUnit",
    "chunk_units",
    "parse_audio",
    "parse_pdf",
    "parse_pptx",
    "parse_source",
]
