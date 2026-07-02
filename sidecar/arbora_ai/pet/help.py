"""Domain B — grounded answers about how to use Arbora.

Grounding source is the packaged help KB (``arbora_ai/help/app_help_kb.md``,
synced from the vault master). Sections are split on ``---`` and embedded
lazily on first use; with well under a hundred sections a plain in-memory
cosine search replaces a FAISS index. Answers follow the same
numbered-passages + structured-output pattern as chat (law #1: citations come
from the KB sections, never from the model).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from pydantic import BaseModel, Field, ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError
from ..rag.embeddings import embed_texts

KB_PATH = Path(__file__).resolve().parent.parent / "help" / "app_help_kb.md"
MAX_RETRIES = 2
DEFAULT_K = 4


@dataclass
class KBSection:
    """One embeddable unit of the help KB (a `---`-delimited section)."""

    index: int  # 1-based section number, used as the citation "page"
    title: str
    text: str


class HelpAnswerGen(BaseModel):
    """Flat schema the LLM fills under constrained decoding."""

    answer: str = Field(min_length=1, max_length=2000)
    used_passage_indices: list[int]  # 1-based indices into the numbered passages


def load_kb_sections(path: Path = KB_PATH) -> list[KBSection]:
    """Split the KB into sections on `---` dividers. The preamble (before the
    first divider) is navigation text, not help content — it is skipped."""
    raw = path.read_text(encoding="utf-8")
    parts = re.split(r"^---\s*$", raw, flags=re.MULTILINE)
    sections: list[KBSection] = []
    for part in parts[1:]:
        text = part.strip()
        if not text:
            continue
        heading = next((ln for ln in text.splitlines() if ln.lstrip().startswith("#")), "")
        title = heading.lstrip("#").strip() or f"Section {len(sections) + 1}"
        sections.append(KBSection(index=len(sections) + 1, title=title, text=text))
    return sections


class HelpIndex:
    """Lazily-embedded KB with cosine search. One instance per process."""

    def __init__(self, path: Path = KB_PATH):
        self._path = path
        self._sections: list[KBSection] | None = None
        self._matrix: np.ndarray | None = None

    def _ensure(self) -> None:
        if self._sections is None:
            self._sections = load_kb_sections(self._path)
        if self._matrix is None:
            vecs = embed_texts([s.text for s in self._sections]).astype("float32")
            norms = np.linalg.norm(vecs, axis=1, keepdims=True)
            self._matrix = vecs / np.maximum(norms, 1e-9)

    def search(self, question: str, k: int = DEFAULT_K) -> list[KBSection]:
        self._ensure()
        assert self._sections is not None and self._matrix is not None
        q = embed_texts([question]).astype("float32")[0]
        q = q / max(float(np.linalg.norm(q)), 1e-9)
        scores = self._matrix @ q
        top = np.argsort(-scores)[: min(k, len(self._sections))]
        return [self._sections[int(i)] for i in top]


_INDEX: HelpIndex | None = None


def get_help_index() -> HelpIndex:
    global _INDEX
    if _INDEX is None:
        _INDEX = HelpIndex()
    return _INDEX


def _prompt(question: str, sections: list[KBSection]) -> str:
    body = "\n\n".join(f"[{i + 1}] {s.text}" for i, s in enumerate(sections))
    return (
        "You are the in-app guide for the Arbora study app. Answer the user's "
        "question about how to use Arbora, using ONLY the numbered guide "
        "passages below. Point to the exact buttons/screens the passages name. "
        "If the passages don't cover it, say the guide doesn't cover that yet — "
        "never invent features.\n\n"
        f"PASSAGES:\n{body}\n\n"
        f"QUESTION: {question}\n\n"
        "Return a JSON object with:\n"
        '- "answer": your answer as plain text\n'
        '- "used_passage_indices": list of the passage numbers you used (e.g. [1, 2])\n'
        "Return only the JSON object."
    )


def answer_app_help(
    question: str, provider: LLMProvider, k: int = DEFAULT_K
) -> tuple[str, list[dict]]:
    """Answer an app-usage question from the KB.

    Returns (answer, refs) where each ref is {"section", "title", "excerpt"}.
    Raises LLMUnavailableError when Ollama is down, ValueError when the model
    can't produce a structured answer.
    """
    sections = get_help_index().search(question, k=k)
    prompt = _prompt(question, sections)
    schema = HelpAnswerGen.model_json_schema()

    gen: HelpAnswerGen | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            gen = HelpAnswerGen.model_validate(raw)
            break
        except (LLMSchemaError, ValidationError):
            continue
    if gen is None:
        raise ValueError("model failed to produce a structured help answer")

    refs: list[dict] = []
    seen: set[int] = set()
    for idx in gen.used_passage_indices:
        pos = idx - 1
        if 0 <= pos < len(sections) and sections[pos].index not in seen:
            s = sections[pos]
            seen.add(s.index)
            refs.append({"section": s.index, "title": s.title, "excerpt": s.text[:200].strip()})
    if not refs and sections:
        s = sections[0]
        refs = [{"section": s.index, "title": s.title, "excerpt": s.text[:200].strip()}]
    return gen.answer, refs
