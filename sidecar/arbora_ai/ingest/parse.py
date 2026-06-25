"""Parse a source file into located text units.

A `SourceUnit` is one citable region of a document — a PDF page, a slide, or an
audio segment — paired with the location that a citation will point back to.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class SourceUnit:
    """One citable region of a source. `location` matches the SourceRef schema:
    {"type": "page", "page": N} or {"type": "timestamp", "timestamp_ms": N}."""

    text: str
    location: dict


def parse_pdf(path: str | Path) -> list[SourceUnit]:
    """One unit per page (1-based page numbers)."""
    import pymupdf

    units: list[SourceUnit] = []
    with pymupdf.open(str(path)) as doc:
        for i, page in enumerate(doc):
            text = page.get_text().strip()
            if text:
                units.append(SourceUnit(text=text, location={"type": "page", "page": i + 1}))
    return units


def parse_pptx(path: str | Path) -> list[SourceUnit]:
    """One unit per slide (1-based; slides cite as `page` per the IPC contract)."""
    from pptx import Presentation

    units: list[SourceUnit] = []
    prs = Presentation(str(path))
    for i, slide in enumerate(prs.slides):
        parts = [
            shape.text_frame.text.strip()
            for shape in slide.shapes
            if shape.has_text_frame and shape.text_frame.text.strip()
        ]
        text = "\n".join(parts).strip()
        if text:
            units.append(SourceUnit(text=text, location={"type": "page", "page": i + 1}))
    return units


def parse_audio(path: str | Path, transcriber=None) -> list[SourceUnit]:
    """One unit per transcript segment, located by start timestamp (ms)."""
    if transcriber is None:
        from ..transcribe.whisper import Transcriber

        transcriber = Transcriber()
    segments = transcriber.transcribe(str(path))
    return [
        SourceUnit(text=seg.text, location={"type": "timestamp", "timestamp_ms": seg.start_ms})
        for seg in segments
        if seg.text.strip()
    ]


_PDF = {".pdf"}
_SLIDE = {".pptx", ".ppt"}
_AUDIO = {".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac"}


def detect_type(path: str | Path) -> str:
    """Map a file extension to a source type ("pdf" | "slide" | "audio")."""
    ext = Path(path).suffix.lower()
    if ext in _PDF:
        return "pdf"
    if ext in _SLIDE:
        return "slide"
    if ext in _AUDIO:
        return "audio"
    raise ValueError(f"unsupported file type: {ext!r}")


def parse_source(path: str | Path, source_type: str | None = None, transcriber=None) -> list[SourceUnit]:
    """Parse any supported source into located units (type auto-detected)."""
    source_type = source_type or detect_type(path)
    if source_type == "pdf":
        return parse_pdf(path)
    if source_type == "slide":
        return parse_pptx(path)
    if source_type == "audio":
        return parse_audio(path, transcriber=transcriber)
    raise ValueError(f"unknown source type: {source_type!r}")
