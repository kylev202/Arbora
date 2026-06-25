"""Prompt builders — one chunk per call, "use only this passage; quote it".

Each prompt pins the model to a single chunk so the excerpt is verifiable. The
model returns content + a verbatim excerpt only; the citation (source_id +
page/timestamp) is attached by the pipeline from the chunk, not the model
(ADR-0004). The schema is enforced separately (structured output).
"""

from __future__ import annotations

from ..ingest.chunk import Chunk

_RULES = (
    "Use ONLY the passage below. Do not add any fact that is not stated in it. "
    "The excerpt MUST be copied word-for-word from the passage (a real substring), "
    "max 200 characters."
)


def _ctx(chunk: Chunk) -> str:
    return f'PASSAGE:\n"""\n{chunk.text}\n"""'


def card_prompt(chunk: Chunk) -> str:
    return (
        f"You write study flashcards. {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Create ONE flashcard that tests a single key fact from the passage:\n"
        "- front: a clear, self-contained question.\n"
        "- back: the concise correct answer, supported by the passage.\n"
        "- explanation: one or two sentences of supporting context from the passage.\n"
        "- excerpt: the exact sentence/phrase from the passage that proves the answer.\n"
        "Return only the JSON object."
    )


def quiz_prompt(chunk: Chunk) -> str:
    return (
        f"You write multiple-choice quiz questions. {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Create ONE multiple-choice question from the passage:\n"
        "- question: clear and answerable from the passage alone.\n"
        "- options: exactly 4 distinct options; exactly one correct.\n"
        "- answer_index: the 0-based index of the correct option.\n"
        "- explanation: why the answer is correct, from the passage.\n"
        "- excerpt: the exact phrase from the passage that supports the answer.\n"
        "Return only the JSON object."
    )


def note_prompt(chunk: Chunk) -> str:
    return (
        f"You write concise study notes. {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Write ONE short note summarising the passage:\n"
        "- content: Markdown, outline style (a few bullet points), at least 20 characters.\n"
        '- format: "outline".\n'
        "- excerpt: an exact phrase copied from the passage.\n"
        "Return only the JSON object."
    )
