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


_MULTI_RULES = (
    "Use ONLY the passages below. Do not add any fact that is not stated in them. "
    "Each excerpt MUST be copied word-for-word from one passage (a real substring), "
    "max 200 characters."
)


def _multi_ctx(chunks: list[Chunk]) -> str:
    return "\n\n".join(f'PASSAGE {i}:\n"""\n{c.text}\n"""' for i, c in enumerate(chunks, start=1))


def walkthrough_overview_prompt(chunks: list[Chunk], week_title: str) -> str:
    topic = f' on "{week_title}"' if week_title else ""
    return (
        f"You write a short overview of one week of a university course{topic}. "
        f"{_MULTI_RULES}\n\n"
        f"{_multi_ctx(chunks)}\n\n"
        "Write the week's overview note:\n"
        "- content: Markdown. A few short paragraphs or bullet groups: what the week "
        "covers, the main ideas, and how they connect. Plain, friendly language.\n"
        "- excerpts: 2-4 exact phrases copied from the passages that support the overview.\n"
        "Return only the JSON object."
    )


def walkthrough_lesson_prompt(chunks: list[Chunk], lesson_number: int, lesson_total: int) -> str:
    return (
        f"You write one small lesson note — part {lesson_number} of {lesson_total} of a "
        f"week's study journey. {_MULTI_RULES}\n\n"
        f"{_multi_ctx(chunks)}\n\n"
        "Write ONE focused lesson from these passages:\n"
        "- title: a short name for what this lesson teaches (a few words).\n"
        "- content: Markdown. Explain the concept simply, then a few bullet points with "
        "the key facts from the passages.\n"
        "- excerpts: 1-3 exact phrases copied from the passages that support the lesson.\n"
        "Return only the JSON object."
    )


def brief_point_prompt(chunk: Chunk, assignment_title: str) -> str:
    return (
        f"You are helping a student prepare for an assignment: {assignment_title}. {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Write ONE concrete thing the student should focus on for this assignment, "
        "drawn only from the passage:\n"
        "- point: one actionable sentence (what to review, understand, or practise).\n"
        "- excerpt: the exact phrase from the passage that supports it.\n"
        "Return only the JSON object."
    )
