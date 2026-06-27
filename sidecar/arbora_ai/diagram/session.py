"""Mermaid diagram generation — FAISS retrieval + grounded diagram synthesis.

Flow (one synchronous call per request):
  1. Embed the topic with Ollama's embedding model.
  2. Search the subject's on-disk FAISS index for the top-k closest chunks.
  3. Build a numbered-passage prompt; the model returns Mermaid 'graph TD' syntax
     and the passage indices it used (same ADR-0004 pattern as Q&A and cards).
  4. Generate DiagramGen with constrained decoding; retry on failure up to MAX_RETRIES.
  5. Map used_passage_indices → authoritative SourceRefs from chunk metadata.

Law posture:
  - Law #1: every node concept must be traced to a retrieved passage;
    SourceRefs are built from chunk metadata (not model output).
  - Law #2: diagrams are visual aids, not deck items — no review gate.
  - Law #3: local-only; provider is always Ollama.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError
from ..rag.embeddings import embed_texts
from ..rag.faiss_index import SubjectIndex
from ..schemas.output import PageLocation, SourceRef, TimestampLocation

MAX_RETRIES = 2
DEFAULT_K = 8


class DiagramGen(BaseModel):
    """Flat schema the LLM fills under constrained decoding."""

    title: str = Field(min_length=1, max_length=100)
    mermaid_code: str = Field(min_length=10, max_length=3000)
    used_passage_indices: list[int]  # 1-based indices into the numbered passages


def _diagram_prompt(topic: str, passages: list[dict]) -> str:
    body = "\n\n".join(f"[{i + 1}] {p['text']}" for i, p in enumerate(passages))
    return (
        f"You are a study assistant. Create a Mermaid diagram about '{topic}' "
        "using ONLY the numbered passages provided below.\n\n"
        f"PASSAGES:\n{body}\n\n"
        "INSTRUCTIONS:\n"
        "- Use 'graph TD' Mermaid syntax\n"
        "- Node IDs must be short alphanumeric (A, B, C1, etc.) — no spaces\n"
        "- Node labels in square brackets: 2–5 words each\n"
        "- Maximum 10 nodes and 12 edges\n"
        "- Base every concept strictly on the passages\n"
        "- Give a short descriptive title (3–7 words)\n\n"
        "Return a JSON object with:\n"
        '- "title": short title string\n'
        '- "mermaid_code": the complete graph TD Mermaid syntax as a string\n'
        '- "used_passage_indices": list of 1-based passage numbers you used\n'
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
    topic: str,
    subject_id: str,
    chunks: list[dict],
    provider: LLMProvider,
    data_dir: str,
    k: int = DEFAULT_K,
) -> tuple[str, str, list[SourceRef]]:
    """Retrieve top-k chunks via FAISS, generate a grounded Mermaid diagram.

    Returns (title, mermaid_code, source_refs). Raises ValueError when there
    is no indexed material to search.
    """
    if not chunks:
        raise ValueError("no indexed material to search")

    index_path = Path(data_dir) / "faiss" / f"{subject_id}.index"
    if not index_path.exists():
        raise ValueError("no indexed material to search")

    by_faiss_id = {int(c["faiss_id"]): c for c in chunks}
    index = SubjectIndex.load(index_path)

    q_vec = embed_texts([topic])
    _, raw_ids = index.search(q_vec, k=min(k, index.size))
    top_chunks = [by_faiss_id[int(fid)] for fid in raw_ids[0] if int(fid) in by_faiss_id]

    if not top_chunks:
        raise ValueError("no matching chunks found")

    prompt = _diagram_prompt(topic, top_chunks)
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
        if 0 <= pos < len(top_chunks):
            chunk = top_chunks[pos]
            sid = chunk["source_id"]
            if sid not in seen:
                seen.add(sid)
                source_refs.append(_source_ref(chunk))

    # Fallback: cite the top-ranked chunk when the model produced no valid indices
    if not source_refs:
        source_refs = [_source_ref(top_chunks[0])]

    return gen.title, gen.mermaid_code, source_refs
