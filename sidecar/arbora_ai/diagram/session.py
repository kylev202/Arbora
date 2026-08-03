"""Week mind map — a grounded hierarchical diagram of a whole week's material.

Flow (one synchronous call per request):
  1. Spread the week's chunks evenly to a small cap (weak-hardware budget), so the
     prompt sees the whole span of the week, not just its first pages.
  2. Build a numbered-passage prompt; the model returns a Mermaid 'graph TD' tree
     (root → theme branches → concept leaves) and the passage indices it used
     (same ADR-0004 grounding pattern as Q&A and cards).
  3. Generate DiagramGen with constrained decoding; retry on failure up to MAX_RETRIES.
  4. Map used_passage_indices → authoritative SourceRefs from chunk metadata.

Unlike the old topic-search diagram, this does no FAISS retrieval: the caller
already scopes `chunks` to the week's processed sources, and the mind map is meant
to cover ALL of that content, not one queried topic.

Law posture:
  - Law #1: every node concept must be traced to a retrieved passage;
    SourceRefs are built from chunk metadata (not model output).
  - Law #2: diagrams are visual aids, not deck items — no review gate.
  - Law #3: local-only; provider is always Ollama.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError
from ..schemas.output import PageLocation, SourceRef, TimestampLocation

MAX_RETRIES = 2
MAX_MINDMAP_CHUNKS = 12  # keep the synthesis prompt small enough for the low preset


class DiagramGen(BaseModel):
    """Flat schema the LLM fills under constrained decoding."""

    title: str = Field(min_length=1, max_length=100)
    mermaid_code: str = Field(min_length=10, max_length=4000)
    used_passage_indices: list[int]  # 1-based indices into the numbered passages


def _spread(chunks: list[dict], n: int) -> list[dict]:
    """Up to `n` chunks spread evenly across the material (walkthrough rule), so a
    whole-week synthesis prompt sees the full span, not just the first pages."""
    if n >= len(chunks):
        return list(chunks)
    step = len(chunks) / n
    return [chunks[int(i * step)] for i in range(n)]


def _mindmap_prompt(week_title: str, passages: list[dict]) -> str:
    subject = week_title.strip() or "this week"
    body = "\n\n".join(f"[{i + 1}] {p['text']}" for i, p in enumerate(passages))
    return (
        "You are a study assistant building a MIND MAP of a whole week's material.\n"
        f"Create a single Mermaid 'graph TD' diagram that organises '{subject}' into a "
        "hierarchy, using ONLY the numbered passages below.\n\n"
        f"PASSAGES:\n{body}\n\n"
        "INSTRUCTIONS:\n"
        "- Use 'graph TD' Mermaid syntax\n"
        "- One ROOT node = the week's overall topic. Then 3–6 main BRANCH nodes for the\n"
        "  major themes, each with 1–4 leaf nodes for the key concepts beneath it\n"
        "- Connect nodes with '-->' so the map fans out from the root like a mind map\n"
        "- Node IDs must be short alphanumeric (R, A, A1, B2, etc.) — no spaces\n"
        "- Node labels in square brackets: 2–5 words each, drawn strictly from the passages\n"
        "- Cover the BREADTH of the week — span the different passages, don't drill into one\n"
        "- Maximum 24 nodes\n"
        "- Give a short descriptive title (3–7 words) naming the week's subject\n\n"
        "Return a JSON object with:\n"
        '- "title": short title string\n'
        '- "mermaid_code": the complete graph TD Mermaid syntax as a string\n'
        '- "used_passage_indices": list of 1-based passage numbers you drew nodes from\n'
        "Return only the JSON object."
    )


def _source_ref(chunk: dict) -> SourceRef:
    excerpt = chunk["text"][:200].strip() or "…"
    if chunk.get("timestamp_ms") is not None:
        return SourceRef(
            source_id=chunk["source_id"],
            location=TimestampLocation(timestamp_ms=int(chunk["timestamp_ms"])),
            excerpt=excerpt,
        )
    page = int(chunk.get("page") or 1)
    return SourceRef(
        source_id=chunk["source_id"],
        location=PageLocation(page=page),
        excerpt=excerpt,
    )


def generate_diagram(
    chunks: list[dict],
    provider: LLMProvider,
    week_title: str = "",
    max_chunks: int = MAX_MINDMAP_CHUNKS,
) -> tuple[str, str, list[SourceRef]]:
    """Build a grounded Mermaid mind map from the week's chunks.

    `chunks` is the week's processed material (already scoped by the caller).
    Returns (title, mermaid_code, source_refs). Raises ValueError when there is
    no material to map.
    """
    if not chunks:
        raise ValueError("no indexed material to map")

    passages = _spread(chunks, max_chunks)

    prompt = _mindmap_prompt(week_title, passages)
    schema = DiagramGen.model_json_schema()
    gen: DiagramGen | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            gen = DiagramGen.model_validate(raw)
            break
        except (LLMSchemaError, ValidationError):
            continue

    if gen is None:
        raise ValueError("model failed to produce a structured diagram")

    # Map 1-based indices → SourceRefs; deduplicate by source_id
    seen: set[str] = set()
    source_refs: list[SourceRef] = []
    for idx in gen.used_passage_indices:
        pos = idx - 1
        if 0 <= pos < len(passages):
            chunk = passages[pos]
            sid = chunk["source_id"]
            if sid not in seen:
                seen.add(sid)
                source_refs.append(_source_ref(chunk))

    # Fallback: cite the first passage when the model produced no valid indices
    if not source_refs:
        source_refs = [_source_ref(passages[0])]

    return gen.title, gen.mermaid_code, source_refs
