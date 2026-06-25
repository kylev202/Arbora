"""Structured output schemas. The citation (`source_ref`) is part of every item
schema, so a missing citation is a validation failure (enforces law #3)."""

from .output import (
    CardOut,
    GenerationResult,
    NoteOut,
    PageLocation,
    QuizItemOut,
    SourceRef,
    TimestampLocation,
)

__all__ = [
    "CardOut",
    "GenerationResult",
    "NoteOut",
    "PageLocation",
    "QuizItemOut",
    "SourceRef",
    "TimestampLocation",
]
