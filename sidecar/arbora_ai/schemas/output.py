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


class BriefPointGen(BaseModel):
    """One focus point of an assignment study brief (slice 5). Same grounded
    shape as the others — content + a verbatim excerpt; the pipeline attaches the
    authoritative citation. Points are assembled into one brief, staged for the
    review gate."""

    point: str = Field(min_length=10, max_length=400)
    excerpt: str = Field(min_length=1, max_length=200)


# ── Practice-test items (subject view redesign) ─────────────────────────────
# On-demand practice tests are ephemeral and cited, like /chat and /diagram —
# they are shown once, never persisted, so they don't pass the review gate
# (law #2 applies to stored deck items). Same ADR-0004 posture: the model
# returns content + a verbatim excerpt; the pipeline attaches the citation.


class MatchPair(BaseModel):
    left: str = Field(min_length=1, max_length=120)
    right: str = Field(min_length=1, max_length=200)


class ShortAnswerOut(BaseModel):
    kind: Literal["short_answer"] = "short_answer"
    question: str = Field(min_length=5, max_length=400)
    expected_answer: str = Field(min_length=1, max_length=400)
    source_ref: SourceRef


class MatchingOut(BaseModel):
    kind: Literal["matching"] = "matching"
    instruction: str = Field(default="Match each term to its description.", max_length=200)
    pairs: list[MatchPair] = Field(min_length=3, max_length=5)
    source_ref: SourceRef


class OrderingOut(BaseModel):
    kind: Literal["ordering"] = "ordering"
    instruction: str = Field(min_length=5, max_length=200)
    steps: list[str] = Field(min_length=3, max_length=6)
    source_ref: SourceRef


class FeynmanOut(BaseModel):
    kind: Literal["feynman"] = "feynman"
    concept: str = Field(min_length=2, max_length=200)
    key_points: list[str] = Field(min_length=2, max_length=4)
    source_ref: SourceRef


class MultipleChoiceOut(BaseModel):
    kind: Literal["multiple_choice"] = "multiple_choice"
    question: str = Field(min_length=5, max_length=400)
    options: list[str] = Field(min_length=4, max_length=4)
    answer_index: int = Field(ge=0, le=3)
    explanation: str = Field(default="", max_length=600)
    source_ref: SourceRef


TestItemOut = Annotated[
    Union[MultipleChoiceOut, ShortAnswerOut, MatchingOut, OrderingOut, FeynmanOut],
    Field(discriminator="kind"),
]


class TestGenerationResult(BaseModel):
    items: list[TestItemOut] = Field(default_factory=list)


# LLM-facing flat gen schemas (citation attached by the pipeline, ADR-0004).


class ShortAnswerGen(BaseModel):
    question: str = Field(min_length=5, max_length=400)
    expected_answer: str = Field(min_length=1, max_length=400)
    excerpt: str = Field(min_length=1, max_length=200)


class MatchingGen(BaseModel):
    instruction: str = Field(default="Match each term to its description.", max_length=200)
    pairs: list[MatchPair] = Field(min_length=3, max_length=5)
    excerpt: str = Field(min_length=1, max_length=200)


class OrderingGen(BaseModel):
    instruction: str = Field(min_length=5, max_length=200)
    steps: list[str] = Field(min_length=3, max_length=6)
    excerpt: str = Field(min_length=1, max_length=200)


class FeynmanGen(BaseModel):
    concept: str = Field(min_length=2, max_length=200)
    key_points: list[str] = Field(min_length=2, max_length=4)
    excerpt: str = Field(min_length=1, max_length=200)


class GradeGen(BaseModel):
    """Structured grade of a free-text answer, compared ONLY against the item's
    expected answer / key points (which are themselves grounded content)."""

    verdict: Literal["correct", "partial", "incorrect"]
    feedback: str = Field(min_length=1, max_length=500)


# ── Week walkthrough (guided week session) ──────────────────────────────────
# One overview note + a few small lesson notes for an outline week, generated
# together so a big week becomes a guided journey. The core persists everything
# reviewed = 0; the user approves each note inline on first read (law #2). Same
# ADR-0004 posture: the model returns content + verbatim excerpts; the pipeline
# attaches authoritative citations from the chunks that ground them.


class ChunkKey(BaseModel):
    """Identity of one core-owned chunk, echoed back so the core can later
    scope practice questions to the exact chunks a lesson was built from."""

    source_id: str
    chunk_index: int


class WalkthroughLessonOut(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    content: str = Field(min_length=20)
    source_refs: list[SourceRef] = Field(min_length=1)
    chunk_refs: list[ChunkKey] = Field(min_length=1)


class WalkthroughResult(BaseModel):
    overview: str = Field(min_length=20)
    overview_refs: list[SourceRef] = Field(min_length=1)
    lessons: list[WalkthroughLessonOut] = Field(min_length=1)


# LLM-facing flat gen schemas (citations attached by the pipeline, ADR-0004).
# A walkthrough note synthesises several passages, so it carries a short list
# of excerpts instead of one — each must still ground verbatim in a passage.

Excerpt = Annotated[str, Field(min_length=1, max_length=200)]


class WalkthroughOverviewGen(BaseModel):
    content: str = Field(min_length=20)
    excerpts: list[Excerpt] = Field(min_length=1, max_length=4)


class WalkthroughLessonGen(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    content: str = Field(min_length=20)
    excerpts: list[Excerpt] = Field(min_length=1, max_length=3)


# ── Syllabus outline extraction (slice 4) ───────────────────────────────────
# Structured extraction from the user's *own* syllabus, confirmed before commit
# (ADR-0006). This is editable schedule metadata, not a study claim, so per-item
# citations aren't required — but the model must extract only what's in the
# document (law #1 in spirit), and nothing is written until the user accepts it
# (law #2). Constraints stay loose so a small local model (Qwen3 4B) fills the
# schema reliably under constrained decoding; the user reviews/edits every row.


class WeekExtraction(BaseModel):
    week_number: int = Field(ge=1, le=53)
    title: str = Field(default="", max_length=200)
    summary: str = Field(default="", max_length=1000)


class DeadlineExtraction(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # ISO date (YYYY-MM-DD) when the syllabus gives one, else "" — the user sets
    # it in a date picker during review. Kept a plain string: small models don't
    # reliably emit valid dates, and an over-strict schema would force retries.
    due_date: str = Field(default="", max_length=40)
    type: Literal["exam", "assignment", "other"] = "other"


class OutlineExtraction(BaseModel):
    weeks: list[WeekExtraction] = Field(default_factory=list)
    deadlines: list[DeadlineExtraction] = Field(default_factory=list)
