"""Practice-test generation — grounded, cited, ephemeral.

Same contract as generate/pipeline.py: constrained generate (flat gen-schema) →
Pydantic validate (bounded retry) → authoritative citation from the chunk
(ADR-0004) → grounding checks → drop, never fix. Items are returned to the
caller for one test session and never persisted, so the review gate doesn't
apply (law #2 covers stored deck items; see /chat and /diagram precedent).
"""

from __future__ import annotations

from collections.abc import Callable

from pydantic import BaseModel, ValidationError

from ..generate.grounding import excerpt_grounded, location_from_chunk, normalize
from ..ingest.chunk import Chunk
from ..llm.provider import LLMProvider, LLMSchemaError
from ..schemas.output import (
    FeynmanGen,
    FeynmanOut,
    MatchingGen,
    MatchingOut,
    MultipleChoiceOut,
    OrderingGen,
    OrderingOut,
    QuizGen,
    ShortAnswerGen,
    ShortAnswerOut,
    SourceRef,
    TestGenerationResult,
)
from . import prompts
from ..generate.prompts import quiz_prompt

MAX_STRUCTURE_RETRIES = 3

TEST_KINDS = ("multiple_choice", "short_answer", "matching", "ordering", "feynman")


def _generate_valid(
    provider: LLMProvider, prompt: str, model_cls: type[BaseModel], base_temp: float = 0.1
) -> BaseModel | None:
    schema = model_cls.model_json_schema()
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=base_temp + attempt * 0.05)
            return model_cls.model_validate(raw)
        except (LLMSchemaError, ValidationError):
            continue
    return None


def _cite(chunk: Chunk, excerpt: str) -> SourceRef:
    return SourceRef(
        source_id=chunk.source_id, location=location_from_chunk(chunk), excerpt=excerpt
    )


def _spread(chunks: list[Chunk], n: int) -> list[Chunk]:
    """Up to `n` chunks spread evenly across the material, so a test covers the
    whole week instead of its first page."""
    if n >= len(chunks):
        return list(chunks)
    step = len(chunks) / n
    return [chunks[int(i * step)] for i in range(n)]


def _build_item(kind: str, chunk: Chunk, provider: LLMProvider):
    """Generate + validate + ground one item of `kind` from `chunk`.
    Returns the item, or None when it never validated or wasn't grounded."""
    if kind == "multiple_choice":
        gen = _generate_valid(provider, quiz_prompt(chunk), QuizGen)
        if gen is None or not excerpt_grounded(gen.excerpt, chunk.text):
            return None
        if len({normalize(o) for o in gen.options}) < 4:
            return None
        return MultipleChoiceOut(
            question=gen.question,
            options=gen.options,
            answer_index=gen.answer_index,
            explanation=gen.explanation,
            source_ref=_cite(chunk, gen.excerpt),
        )
    if kind == "short_answer":
        gen = _generate_valid(provider, prompts.short_answer_prompt(chunk), ShortAnswerGen)
        if gen is None or not excerpt_grounded(gen.excerpt, chunk.text):
            return None
        return ShortAnswerOut(
            question=gen.question,
            expected_answer=gen.expected_answer,
            source_ref=_cite(chunk, gen.excerpt),
        )
    if kind == "matching":
        gen = _generate_valid(provider, prompts.matching_prompt(chunk), MatchingGen)
        if gen is None or not excerpt_grounded(gen.excerpt, chunk.text):
            return None
        lefts = {normalize(p.left) for p in gen.pairs}
        rights = {normalize(p.right) for p in gen.pairs}
        if len(lefts) < len(gen.pairs) or len(rights) < len(gen.pairs):
            return None  # ambiguous pairs can't be graded fairly
        return MatchingOut(
            instruction=gen.instruction, pairs=gen.pairs, source_ref=_cite(chunk, gen.excerpt)
        )
    if kind == "ordering":
        gen = _generate_valid(provider, prompts.ordering_prompt(chunk), OrderingGen)
        if gen is None or not excerpt_grounded(gen.excerpt, chunk.text):
            return None
        if len({normalize(s) for s in gen.steps}) < len(gen.steps):
            return None
        return OrderingOut(
            instruction=gen.instruction, steps=gen.steps, source_ref=_cite(chunk, gen.excerpt)
        )
    if kind == "feynman":
        gen = _generate_valid(provider, prompts.feynman_prompt(chunk), FeynmanGen)
        if gen is None or not excerpt_grounded(gen.excerpt, chunk.text):
            return None
        return FeynmanOut(
            concept=gen.concept, key_points=gen.key_points, source_ref=_cite(chunk, gen.excerpt)
        )
    return None


def generate_test(
    provider: LLMProvider,
    chunks: list[Chunk],
    types: list[str],
    count_per_type: int = 2,
    progress_cb: Callable[[int, int, int], None] | None = None,
) -> TestGenerationResult:
    """Generate up to `count_per_type` items of each requested type, each from a
    different chunk where possible. Bad items are dropped, never retried for
    grounding — the test just comes out shorter."""
    kinds = [t for t in types if t in TEST_KINDS]
    result = TestGenerationResult()
    total = len(kinds) * count_per_type
    done = 0
    for kind in kinds:
        for chunk in _spread(chunks, count_per_type):
            item = _build_item(kind, chunk, provider)
            if item is not None:
                result.items.append(item)
            done += 1
            if progress_cb is not None:
                progress_cb(done, total, len(result.items))
    return result
