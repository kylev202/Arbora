"""Generation: turn grounded chunks into cited cards / quiz items / notes.

Pipeline (per the three immutable laws):
  chunk → constrained LLM call → Pydantic validate (retry) → grounding checks →
  keep or drop. A dropped item is never trusted; nothing here is `reviewed`.
"""

from .pipeline import GenStats, generate_from_chunks

__all__ = ["GenStats", "generate_from_chunks"]
