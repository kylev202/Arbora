"""Ingest: parse a source document into located text units, then chunk them.

Every chunk keeps the location (page for pdf/slide/doc/text, timestamp for audio)
it came from, so any item generated from it can carry a traceable citation (law #3).
"""

from .chunk import Chunk, chunk_units
from .parse import SourceUnit, parse_audio, parse_docx, parse_pdf, parse_pptx, parse_source, parse_text

__all__ = [
    "Chunk",
    "SourceUnit",
    "chunk_units",
    "parse_audio",
    "parse_docx",
    "parse_pdf",
    "parse_pptx",
    "parse_source",
    "parse_text",
]
