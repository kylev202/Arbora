"""Per-chunk generation orchestrator.

For each chunk and requested type: constrained generate (flat gen-schema) →
Pydantic validate (with bounded retry) → build the final item with an
**authoritative** citation (source_id/location from the chunk, ADR-0004) →
grounding checks → dedupe. Structure failures are retried; grounding failures are
dropped immediately. The batch never fails as a whole — bad items are dropped and
counted.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from ..ingest.chunk import Chunk
from ..llm.provider import LLMProvider, LLMSchemaError
from ..schemas.output import (
    CardGen,
    CardOut,
    GenerationResult,
    NoteGen,
    NoteOut,
    QuizGen,
    QuizItemOut,
    SourceRef,
)
from . import grounding
from .grounding import location_from_chunk, normalize
from .prompts import card_prompt, note_prompt, quiz_prompt

MAX_STRUCTURE_RETRIES = 3


@dataclass
class GenStats:
    attempts: int = 0
    structure_fails: int = 0  # never produced schema-valid JSON in N tries
    grounding_drops: int = 0  # valid shape but not traceable to the source
    dedupe_drops: int = 0
    accepted: int = 0
    drop_reasons: dict[str, int] = field(default_factory=dict)

    def _reason(self, reason: str) -> None:
        self.drop_reasons[reason] = self.drop_reasons.get(reason, 0) + 1

    @property
    def acceptance_rate(self) -> float:
        return self.accepted / self.attempts if self.attempts else 0.0


def _generate_valid(
    provider: LLMProvider, prompt: str, model_cls: type[BaseModel], base_temp: float
) -> BaseModel | None:
    """Constrained generate + validate, retrying structure errors up to N times.
    Returns the validated model, or None if it never produced a valid shape."""
    schema = model_cls.model_json_schema()
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=base_temp + attempt * 0.05)
            return model_cls.model_validate(raw)
        except (LLMSchemaError, ValidationError):
            continue
    return None


def _cite(chunk: Chunk, excerpt: str) -> SourceRef:
    """Authoritative citation: source/location from the chunk, excerpt from the
    model (verified verbatim by the grounding checks)."""
    return SourceRef(source_id=chunk.source_id, location=location_from_chunk(chunk), excerpt=excerpt)


def generate_from_chunks(
    provider: LLMProvider,
    chunks: list[Chunk],
    types: list[str],
    base_temp: float = 0.1,
) -> tuple[GenerationResult, dict[str, GenStats]]:
    """Generate the requested item types from every chunk. Returns the kept
    items plus per-type stats (for the quality report)."""
    result = GenerationResult()
    stats = {t: GenStats() for t in types}
    seen_fronts: set[str] = set()

    for chunk in chunks:
        if "cards" in types:
            st = stats["cards"]
            st.attempts += 1
            gen = _generate_valid(provider, card_prompt(chunk), CardGen, base_temp)
            if gen is None:
                st.structure_fails += 1
                st._reason("invalid schema after retries")
            else:
                card = CardOut(
                    front=gen.front, back=gen.back, explanation=gen.explanation,
                    source_ref=_cite(chunk, gen.excerpt),
                )
                reason = grounding.check_card(card, chunk)
                key = normalize(card.front)
                if reason:
                    st.grounding_drops += 1
                    st._reason(reason)
                elif key in seen_fronts:
                    st.dedupe_drops += 1
                    st._reason("duplicate front")
                else:
                    seen_fronts.add(key)
                    result.cards.append(card)
                    st.accepted += 1

        if "quiz" in types:
            st = stats["quiz"]
            st.attempts += 1
            gen = _generate_valid(provider, quiz_prompt(chunk), QuizGen, base_temp)
            if gen is None:
                st.structure_fails += 1
                st._reason("invalid schema after retries")
            else:
                quiz = QuizItemOut(
                    question=gen.question, options=gen.options, answer_index=gen.answer_index,
                    explanation=gen.explanation, source_ref=_cite(chunk, gen.excerpt),
                )
                reason = grounding.check_quiz(quiz, chunk)
                if reason:
                    st.grounding_drops += 1
                    st._reason(reason)
                else:
                    result.quiz_items.append(quiz)
                    st.accepted += 1

        if "notes" in types:
            st = stats["notes"]
            st.attempts += 1
            gen = _generate_valid(provider, note_prompt(chunk), NoteGen, base_temp)
            if gen is None:
                st.structure_fails += 1
                st._reason("invalid schema after retries")
            else:
                note = NoteOut(
                    content=gen.content, format=gen.format, source_refs=[_cite(chunk, gen.excerpt)]
                )
                reason = grounding.check_note(note, chunk)
                if reason:
                    st.grounding_drops += 1
                    st._reason(reason)
                else:
                    result.notes.append(note)
                    st.accepted += 1

    return result, stats
