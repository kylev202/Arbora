"""RAG Q&A — hybrid retrieval + grounded, conversational answer generation.

Flow (one synchronous call per question):
  1. If the question is a follow-up (history present), condense it into a
     standalone search query with one small LLM call ("it"/"that" resolved),
     falling back to the raw question on any failure.
  2. Embed the search query and rank chunks two ways — FAISS (semantic) and
     BM25 (exact keywords) — fused by reciprocal rank, then expanded with
     same-source neighbour chunks (rag/retrieve.py).
  3. Build a numbered-passage tutor prompt (persona / grounding rules / output
     format), including recent conversation turns for continuity. The model
     cites passage numbers, not source ids — those are attached authoritatively
     from chunk metadata (ADR-0004).
  4. Generate a ChatAnswerGen (answer + used_passage_indices + follow-up
     suggestions) with constrained decoding; retry structure failures.
  5. Map used_passage_indices back to SourceRefs from the retrieved chunks.

Law posture:
  - Law #1: SourceRefs are built from chunk metadata (not model output), so
    citations are authoritative. If the model cites no valid passage, the
    top-ranked chunk is used as a fallback citation (the answer may still be
    useful even without explicit index markers). If the model reports the
    passages don't answer the question (grounded=false), a standard "add more
    sources" reply is returned with no citation — never a fabricated answer.
  - Law #2: Q&A is ephemeral conversation, not a deck item — no review gate.
  - Law #3: local-only; provider in this path is always Ollama.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, Field, ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError
from ..rag.embeddings import embed_texts
from ..rag.faiss_index import SubjectIndex
from ..rag.retrieve import hybrid_select
from ..schemas.output import PageLocation, SourceRef, TimestampLocation

MAX_RETRIES = 2
DEFAULT_K = 6
HISTORY_TURNS = 6  # most recent history entries included in prompts
HISTORY_CHARS = 280  # per-entry cap so old walls of text don't crowd the prompt

# Standard reply when the retrieved passages don't cover the question. Returned
# verbatim with no citations, so a "lack of information" answer never fabricates
# an answer or attaches a misleading citation.
INSUFFICIENT_CONTEXT_MESSAGE = (
    "I couldn't find enough in your sources to answer that. Try adding more "
    "sources on this topic, then ask again."
)

FollowUp = Annotated[str, Field(min_length=1, max_length=160)]


class ChatAnswerGen(BaseModel):
    """Flat schema the LLM fills under constrained decoding."""

    answer: str = Field(min_length=1, max_length=2600)
    used_passage_indices: list[int]  # 1-based indices into the numbered passages
    grounded: bool = True  # False when the passages don't answer the question
    follow_up_questions: list[FollowUp] = Field(default_factory=list, max_length=3)


class SearchQueryGen(BaseModel):
    """One standalone search query condensed from a follow-up question."""

    search_query: str = Field(min_length=1, max_length=300)


def _history_block(history: list[dict]) -> str:
    lines = []
    for turn in history[-HISTORY_TURNS:]:
        content = " ".join(str(turn.get("content", "")).split())
        if len(content) > HISTORY_CHARS:
            content = content[:HISTORY_CHARS] + "…"
        speaker = "Student" if turn.get("role") == "user" else "Tutor"
        lines.append(f"{speaker}: {content}")
    return "\n".join(lines)


def _condense_query(question: str, history: list[dict], provider: LLMProvider) -> str:
    """Rewrite a follow-up into a standalone search query ("why does it do
    that?" → names the actual topic). Falls back to the raw question on any
    structure failure — retrieval still works, just without pronoun resolution."""
    prompt = (
        "You rewrite a student's follow-up question so it can be searched on its own.\n\n"
        f"CONVERSATION:\n{_history_block(history)}\n\n"
        f"FOLLOW-UP QUESTION: {question}\n\n"
        "Rewrite the follow-up as ONE standalone question that names the specific "
        'topic and terms it refers to (resolve words like "it", "that", "this one" '
        "from the conversation). Keep it to one short sentence. If it is already "
        "standalone, return it unchanged.\n"
        'Return a JSON object with "search_query". Return only the JSON object.'
    )
    try:
        raw = provider.generate(prompt, schema=SearchQueryGen.model_json_schema(), temperature=0.0)
        return SearchQueryGen.model_validate(raw).search_query
    except (LLMSchemaError, ValidationError):
        return question


def _qa_prompt(question: str, passages: list[dict], history: list[dict]) -> str:
    body = "\n\n".join(f"[{i + 1}] {p['text']}" for i, p in enumerate(passages))
    history_block = (
        f"CONVERSATION SO FAR (context only — never a source of facts):\n"
        f"{_history_block(history)}\n\n"
        if history
        else ""
    )
    return (
        "You are Arbora's study tutor: a patient university tutor helping a "
        "student master their own course material.\n\n"
        f"{history_block}"
        f"SOURCE PASSAGES (the only permitted source of facts):\n{body}\n\n"
        f"STUDENT'S QUESTION: {question}\n\n"
        "HOW TO ANSWER:\n"
        "- Use ONLY the numbered passages. Never use outside knowledge; never "
        "invent facts, numbers, or examples that are not in them.\n"
        "- Put a passage marker like [1] or [2] right after each claim it supports.\n"
        "- Explain like a tutor: define technical terms in plain words, and when "
        "the passages show WHY or HOW something works, explain the mechanism "
        "rather than just restating the fact.\n"
        "- Keep it tight: 2-6 sentences for a simple question; short paragraphs "
        "separated by blank lines for a complex one.\n"
        '- If the passages do not contain the information needed, set "grounded" '
        'to false and say briefly in "answer" what is missing.\n'
        "- Suggest up to 3 short follow_up_questions the student could ask next "
        "that ARE answerable from these passages (empty list if none).\n\n"
        "Return a JSON object with:\n"
        '- "answer": your answer as plain text with inline [N] citation markers\n'
        '- "used_passage_indices": list of the passage numbers you cited (e.g. [1, 2])\n'
        '- "grounded": true if the passages answer the question, false if they lack the information\n'
        '- "follow_up_questions": up to 3 short questions answerable from the passages\n'
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
    history: list[dict] | None = None,
) -> tuple[str, list[SourceRef], list[str]]:
    """Retrieve top chunks (hybrid semantic + keyword), generate a grounded
    answer that continues the conversation in `history` (list of
    {"role": "user"|"assistant", "content": str}, oldest first).

    Returns (answer_text, source_refs, suggested_questions). Raises ValueError
    when there is no indexed material to search.
    """
    history = history or []
    if not chunks:
        raise ValueError("no indexed material to search")

    index_path = Path(data_dir) / "faiss" / f"{subject_id}.index"
    if not index_path.exists():
        raise ValueError("no indexed material to search")

    position_of = {int(c["faiss_id"]): i for i, c in enumerate(chunks)}
    index = SubjectIndex.load(index_path)

    search_query = _condense_query(question, history, provider) if history else question
    q_vec = embed_texts([search_query])
    _, raw_ids = index.search(q_vec, k=min(2 * k, index.size))
    vector_positions = [position_of[int(fid)] for fid in raw_ids[0] if int(fid) in position_of]

    top_positions = hybrid_select(search_query, chunks, vector_positions, k=k)
    top_chunks = [chunks[pos] for pos in top_positions]

    if not top_chunks:
        raise ValueError("no matching chunks found")

    prompt = _qa_prompt(question, top_chunks, history)
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

    # The passages don't cover the question — return the standard "add more
    # sources" reply with no citation (never fabricate an answer or a source).
    if not gen.grounded:
        return INSUFFICIENT_CONTEXT_MESSAGE, [], []

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

    suggestions = [q.strip() for q in gen.follow_up_questions if q.strip()][:3]
    return gen.answer, source_refs, suggestions
