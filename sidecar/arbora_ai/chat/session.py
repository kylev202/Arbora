"""RAG Q&A — FAISS retrieval + grounded answer generation.

Flow (one synchronous call per question):
  1. Embed the question with Ollama's embedding model.
  2. Search the subject's on-disk FAISS index for the top-k closest chunks.
  3. Build a numbered-passage prompt (the model cites passage numbers, not
     source ids — those are attached authoritatively from chunk metadata,
     same principle as ADR-0004).
  4. Generate a ChatAnswerGen (answer + used_passage_indices) with constrained
     decoding; retry on structure failures up to MAX_RETRIES.
  5. Map used_passage_indices back to SourceRefs from the retrieved chunks.

Law posture:
  - Law #1: SourceRefs are built from chunk metadata (not model output), so
    citations are authoritative. If the model cites no valid passage, the
    top-ranked chunk is used as a fallback citation (the answer may still be
    useful even without explicit index markers).
  - Law #2: Q&A is ephemeral conversation, not a deck item — no review gate.
  - Law #3: local-only; provider in this path is always Ollama.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError
from ..rag.embeddings import embed_texts
from ..rag.faiss_index import SubjectIndex
from ..schemas.output import PageLocation, SourceRef, TimestampLocation

MAX_RETRIES = 2
DEFAULT_K = 6


class ChatAnswerGen(BaseModel):
    """Flat schema the LLM fills under constrained decoding."""

    answer: str = Field(min_length=1, max_length=2000)
    used_passage_indices: list[int]  # 1-based indices into the numbered passages


def _qa_prompt(question: str, passages: list[dict]) -> str:
    body = "\n\n".join(f"[{i + 1}] {p['text']}" for i, p in enumerate(passages))
    return (
        "You are a study assistant. Answer the student's question using ONLY "
        "the numbered passages provided below. Use inline markers like [1], [2] "
        "to cite which passages support your answer. "
        "If the passages don't contain enough to answer, say so clearly.\n\n"
        f"PASSAGES:\n{body}\n\n"
        f"QUESTION: {question}\n\n"
        "Return a JSON object with:\n"
        '- "answer": your answer as plain text with inline [N] citation markers\n'
        '- "used_passage_indices": list of the passage numbers you cited (e.g. [1, 2])\n'
        "Return only the JSON object."
    )


def _source_ref(chunk: dict) -> SourceRef:
    """Build an authoritative SourceRef from chunk metadata (not model output)."""
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


def answer_question(
    question: str,
    subject_id: str,
    chunks: list[dict],
    provider: LLMProvider,
    data_dir: str,
    k: int = DEFAULT_K,
) -> tuple[str, list[SourceRef]]:
    """Retrieve top-k chunks via FAISS, generate a grounded answer.

    Returns (answer_text, source_refs). Raises ValueError when there is no
    indexed material to search.
    """
    if not chunks:
        raise ValueError("no indexed material to search")

    index_path = Path(data_dir) / "faiss" / f"{subject_id}.index"
    if not index_path.exists():
        raise ValueError("no indexed material to search")

    by_faiss_id = {int(c["faiss_id"]): c for c in chunks}
    index = SubjectIndex.load(index_path)

    q_vec = embed_texts([question])
    _, raw_ids = index.search(q_vec, k=min(k, index.size))
    top_chunks = [by_faiss_id[int(fid)] for fid in raw_ids[0] if int(fid) in by_faiss_id]

    if not top_chunks:
        raise ValueError("no matching chunks found")

    prompt = _qa_prompt(question, top_chunks)
    schema = ChatAnswerGen.model_json_schema()
    gen: ChatAnswerGen | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            gen = ChatAnswerGen.model_validate(raw)
            break
        except (LLMSchemaError, ValidationError):
            continue

    if gen is None:
        raise ValueError("model failed to produce a structured answer")

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

    return gen.answer, source_refs
