"""Assignment study brief: grounded focus points over the covered weeks' chunks.

Same law posture as the card/quiz/note pipeline — each focus point is generated
from a single chunk, validated against a schema, and kept only if its excerpt is
verbatim in that chunk (law #1); the citation is authoritative, taken from the
chunk rather than the model (ADR-0004). The kept points are assembled into ONE
brief (Markdown content + one source_ref per point) that the core stages
`reviewed = 0` for the human gate (law #2). A brief with no groundable point is
returned empty, never invented.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel, ValidationError

from ..ingest.chunk import Chunk
from ..llm.provider import LLMProvider, LLMSchemaError
from ..schemas.output import BriefPointGen, SourceRef
from . import grounding
from .grounding import location_from_chunk, normalize
from .prompts import brief_point_prompt

MAX_STRUCTURE_RETRIES = 3
DEFAULT_MAX_POINTS = 8  # keep a brief focused, not a wall of bullets


@dataclass
class BriefStats:
    attempts: int = 0
    structure_fails: int = 0
    grounding_drops: int = 0
    dedupe_drops: int = 0
    accepted: int = 0


def _generate_point(
    provider: LLMProvider, prompt: str, base_temp: float
) -> BriefPointGen | None:
    """Constrained generate + validate, retrying structure errors up to N times."""
    schema = BriefPointGen.model_json_schema()
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=base_temp + attempt * 0.05)
            return BriefPointGen.model_validate(raw)
        except (LLMSchemaError, ValidationError):
            continue
    return None


def generate_brief(
    provider: LLMProvider,
    chunks: list[Chunk],
    assignment_title: str,
    max_points: int = DEFAULT_MAX_POINTS,
    base_temp: float = 0.1,
    progress_cb: Callable[[int, int, int], None] | None = None,
) -> tuple[str, list[SourceRef], BriefStats]:
    """Generate up to `max_points` grounded focus points and assemble them into a
    single brief. Returns (markdown_content, source_refs, stats)."""
    lines: list[str] = []
    refs: list[SourceRef] = []
    seen: set[str] = set()
    stats = BriefStats()
    total = len(chunks)

    for done, chunk in enumerate(chunks, start=1):
        if len(refs) < max_points:
            stats.attempts += 1
            gen = _generate_point(provider, brief_point_prompt(chunk, assignment_title), base_temp)
            if gen is None:
                stats.structure_fails += 1
            elif not grounding.excerpt_grounded(gen.excerpt, chunk.text):
                stats.grounding_drops += 1
            elif normalize(gen.point) in seen:
                stats.dedupe_drops += 1
            else:
                seen.add(normalize(gen.point))
                lines.append(f"- {gen.point.strip()}")
                refs.append(
                    SourceRef(
                        source_id=chunk.source_id,
                        location=location_from_chunk(chunk),
                        excerpt=gen.excerpt,
                    )
                )
                stats.accepted += 1
        if progress_cb is not None:
            progress_cb(done, total, len(refs))

    return "\n".join(lines), refs, stats


# Re-exported so `generate.job` can import the assembled-result type if needed.
class BriefResult(BaseModel):
    content: str
    source_refs: list[SourceRef]
