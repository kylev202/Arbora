"""Pydantic output schemas — the source of truth for AI-generated content.

Mirrors resources/vault "Output Schemas". The citation `source_ref` is a
**required** field on every item (no Optional), so the schema itself enforces
law #3: an item that can't name its source fails validation and is dropped.

These models are used two ways:
  1. `model_json_schema()` constrains the LLM (Ollama structured output / GBNF).
  2. `model_validate()` checks the raw response → retry on failure (law: never
     parse free text).
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class PageLocation(BaseModel):
    type: Literal["page"] = "page"
    page: int = Field(ge=1)


class TimestampLocation(BaseModel):
    type: Literal["timestamp"] = "timestamp"
    timestamp_ms: int = Field(ge=0)


Location = Annotated[Union[PageLocation, TimestampLocation], Field(discriminator="type")]


class SourceRef(BaseModel):
    source_id: str
    location: Location
    excerpt: str = Field(min_length=1, max_length=200)


class CardOut(BaseModel):
    front: str = Field(min_length=3, max_length=300)
    back: str = Field(min_length=1, max_length=500)
    explanation: str = Field(default="", max_length=600)
    source_ref: SourceRef


class QuizItemOut(BaseModel):
    question: str = Field(min_length=5, max_length=400)
    options: list[str] = Field(min_length=4, max_length=4)
    answer_index: int = Field(ge=0, le=3)
    explanation: str = Field(default="", max_length=600)
    source_ref: SourceRef


class NoteOut(BaseModel):
    content: str = Field(min_length=20)
    format: Literal["cornell", "outline"]
    source_refs: list[SourceRef] = Field(min_length=1)


class GenerationResult(BaseModel):
    notes: list[NoteOut] = Field(default_factory=list)
    cards: list[CardOut] = Field(default_factory=list)
    quiz_items: list[QuizItemOut] = Field(default_factory=list)


# ── LLM-facing generation schemas ──────────────────────────────────────────
# The model never produces a citation (it hallucinates source ids/pages — see
# ADR-0004). It returns content + a verbatim `excerpt`; the pipeline attaches the
# authoritative source_id/location from the chunk. Flatter schema = small models
# (e.g. Qwen3 4B) fill it reliably under constrained decoding.


class CardGen(BaseModel):
    front: str = Field(min_length=3, max_length=300)
    back: str = Field(min_length=1, max_length=500)
    explanation: str = Field(default="", max_length=600)
    excerpt: str = Field(min_length=1, max_length=200)


class QuizGen(BaseModel):
    question: str = Field(min_length=5, max_length=400)
    options: list[str] = Field(min_length=4, max_length=4)
    answer_index: int = Field(ge=0, le=3)
    explanation: str = Field(default="", max_length=600)
    excerpt: str = Field(min_length=1, max_length=200)


class NoteGen(BaseModel):
    content: str = Field(min_length=20)
    format: Literal["cornell", "outline"]
    excerpt: str = Field(min_length=1, max_length=200)
