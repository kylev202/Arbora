"""Week walkthrough: one grounded overview note + a few small lesson notes.

Same law posture as the card/quiz/note pipeline — constrained generate (flat
gen-schema) → Pydantic validate (bounded retry) → every model-supplied excerpt
verified verbatim against the passages it was generated from, with the citation
attached authoritatively from the matching chunk (ADR-0004). An overview that
cannot be grounded fails the job (a walkthrough can't exist without it); a
lesson that cannot be grounded is skipped, never invented. The core stages
everything reviewed = 0 for the inline first-read gate (law #2).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel, ValidationError

from ..ingest.chunk import Chunk
from ..llm.provider import LLMProvider, LLMSchemaError
from ..schemas.output import (
    ChunkKey,
    SourceRef,
    WalkthroughLessonGen,
    WalkthroughLessonOut,
    WalkthroughOverviewGen,
    WalkthroughResult,
)
from .grounding import excerpt_grounded, location_from_chunk
from .prompts import walkthrough_lesson_prompt, walkthrough_overview_prompt

MAX_STRUCTURE_RETRIES = 3
MAX_OVERVIEW_CHUNKS = 10  # keep the synthesis prompt small enough for the low preset
MAX_LESSON_CHUNKS = 8
CHUNKS_PER_LESSON = 6  # ~1 lesson per 6 chunks of material
MAX_LESSONS = 5


@dataclass
class WalkthroughStats:
    attempts: int = 0
    structure_fails: int = 0
    grounding_drops: int = 0
    accepted: int = 0


def _generate_valid(
    provider: LLMProvider, prompt: str, model_cls: type[BaseModel], base_temp: float
) -> BaseModel | None:
    schema = model_cls.model_json_schema()
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=base_temp + attempt * 0.05)
            return model_cls.model_validate(raw)
        except (LLMSchemaError, ValidationError):
            continue
    return None


def _spread(chunks: list[Chunk], n: int) -> list[Chunk]:
    """Up to `n` chunks spread evenly across the material (assess-pipeline rule),
    so a synthesis prompt sees the whole span, not just its first pages."""
    if n >= len(chunks):
        return list(chunks)
    step = len(chunks) / n
    return [chunks[int(i * step)] for i in range(n)]


def lesson_count(n_chunks: int) -> int:
    return max(1, min(MAX_LESSONS, -(-n_chunks // CHUNKS_PER_LESSON)))


def _buckets(chunks: list[Chunk], n: int) -> list[list[Chunk]]:
    """`n` contiguous runs of near-equal size — chunks arrive in reading order,
    so contiguous slices keep each lesson topically coherent."""
    base, extra = divmod(len(chunks), n)
    out: list[list[Chunk]] = []
    start = 0
    for i in range(n):
        size = base + (1 if i < extra else 0)
        out.append(chunks[start : start + size])
        start += size
    return [b for b in out if b]


def _ground_refs(excerpts: list[str], chunks: list[Chunk]) -> list[SourceRef]:
    """Authoritative citations: one ref per excerpt that appears verbatim in a
    passage, anchored to the first chunk containing it. Ungrounded excerpts are
    silently dropped — the caller decides whether zero refs is fatal."""
    refs: list[SourceRef] = []
    for excerpt in excerpts:
        chunk = next((c for c in chunks if excerpt_grounded(excerpt, c.text)), None)
        if chunk is not None:
            refs.append(
                SourceRef(
                    source_id=chunk.source_id,
                    location=location_from_chunk(chunk),
                    excerpt=excerpt,
                )
            )
    return refs


def generate_walkthrough(
    provider: LLMProvider,
    chunks: list[Chunk],
    week_title: str = "",
    base_temp: float = 0.1,
    progress_cb: Callable[[int, int, int], None] | None = None,
) -> tuple[WalkthroughResult, WalkthroughStats]:
    """Generate the week's overview + one note per lesson bucket. Returns the
    result plus stats. Raises ValueError (NO_CHUNKS / NO_OVERVIEW / NO_LESSONS)
    when nothing groundable can be built — never a partial invention."""
    if not chunks:
        raise ValueError("NO_CHUNKS: nothing to build a walkthrough from")

    stats = WalkthroughStats()
    buckets = _buckets(chunks, lesson_count(len(chunks)))
    total = 1 + len(buckets)
    done = 0

    def tick() -> None:
        if progress_cb is not None:
            progress_cb(done, total, stats.accepted)

    # Overview first — a walkthrough can't exist without it.
    stats.attempts += 1
    overview_chunks = _spread(chunks, MAX_OVERVIEW_CHUNKS)
    overview = _generate_valid(
        provider,
        walkthrough_overview_prompt(overview_chunks, week_title),
        WalkthroughOverviewGen,
        base_temp,
    )
    if overview is None:
        stats.structure_fails += 1
        raise ValueError("NO_OVERVIEW: overview never produced a valid shape")
    overview_refs = _ground_refs(overview.excerpts, overview_chunks)
    if not overview_refs:
        stats.grounding_drops += 1
        raise ValueError("NO_OVERVIEW: overview could not be grounded in the material")
    stats.accepted += 1
    done += 1
    tick()

    lessons: list[WalkthroughLessonOut] = []
    for i, bucket in enumerate(buckets, start=1):
        stats.attempts += 1
        prompt_chunks = _spread(bucket, MAX_LESSON_CHUNKS)
        lesson = _generate_valid(
            provider,
            walkthrough_lesson_prompt(prompt_chunks, i, len(buckets)),
            WalkthroughLessonGen,
            base_temp,
        )
        if lesson is None:
            stats.structure_fails += 1
        else:
            refs = _ground_refs(lesson.excerpts, prompt_chunks)
            if not refs:
                stats.grounding_drops += 1
            else:
                lessons.append(
                    WalkthroughLessonOut(
                        title=lesson.title,
                        content=lesson.content,
                        source_refs=refs,
                        chunk_refs=[
                            ChunkKey(source_id=c.source_id, chunk_index=c.index) for c in bucket
                        ],
                    )
                )
                stats.accepted += 1
        done += 1
        tick()

    if not lessons:
        raise ValueError("NO_LESSONS: no lesson could be grounded in the material")

    result = WalkthroughResult(
        overview=overview.content, overview_refs=overview_refs, lessons=lessons
    )
    return result, stats
