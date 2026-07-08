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

# Shared Markdown house style for all generated notes, so they render as clean,
# consistent structure (headings, bullets, section breaks) rather than a wall of
# text or raw symbols.
_NOTE_STYLE = (
    "Formatting: write clean Markdown. Use `## ` for section headings and `- ` for "
    "bullet points; use `**bold**` only to mark a key term. Do not use `#` (single) "
    "headings, tables, or images. Keep every statement grounded in the source "
    "material — do not invent facts, examples, or numbers to fill the structure."
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
        f"You write clear, well-structured study notes. {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Write ONE study note on the passage as Markdown, in order:\n"
        "1. A `## ` heading naming the topic of the passage (a few words).\n"
        "2. A one-sentence summary of what the passage covers (plain text, no heading).\n"
        "3. A few `- ` bullets on the key points, using `**bold**` to mark key terms.\n"
        "Return a JSON object with:\n"
        "- content: the structured Markdown note above, at least 20 characters.\n"
        '- format: "outline".\n'
        "- excerpt: an exact phrase copied from the passage.\n"
        f"{_NOTE_STYLE}\n"
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
        f"You write a clear, well-structured overview of one week of a university "
        f"course{topic}. {_MULTI_RULES}\n\n"
        f"{_multi_ctx(chunks)}\n\n"
        "Write the week's overview note as Markdown with this structure, in order:\n"
        "1. A one- or two-sentence summary of what the week is about (plain text, no heading).\n"
        "2. Two or three `## ` sections covering the main ideas and how they connect — a "
        "short sentence or two then `- ` bullets in each.\n"
        "3. A final `## Key takeaways` section: 2-4 bullets of what to remember.\n"
        "Do not repeat the week title as a heading.\n"
        f"{_NOTE_STYLE}\n"
        "Return a JSON object with:\n"
        "- content: the structured Markdown note above.\n"
        "- excerpts: 2-4 exact phrases copied from the passages that support the overview.\n"
        "Return only the JSON object."
    )


def walkthrough_lesson_prompt(chunks: list[Chunk], lesson_number: int, lesson_total: int) -> str:
    return (
        f"You write one small, well-structured lesson note — part {lesson_number} of "
        f"{lesson_total} of a week's study journey. {_MULTI_RULES}\n\n"
        f"{_multi_ctx(chunks)}\n\n"
        "Write ONE focused lesson from these passages. Return a JSON object with:\n"
        "- title: a short name for what this lesson teaches (a few words).\n"
        "- content: structured Markdown, in order:\n"
        "    1. A one-sentence summary of the lesson (plain text, no heading).\n"
        "    2. A `## Key ideas` section: a short explanation then 2-5 `- ` bullets of the "
        "key facts from the passages.\n"
        "    3. A `## Takeaway` section: one or two bullets on what matters most.\n"
        "  Do not repeat the title as a heading.\n"
        "- excerpts: 1-3 exact phrases copied from the passages that support the lesson.\n"
        f"{_NOTE_STYLE}\n"
        "Return only the JSON object."
    )


def brief_point_prompt(chunk: Chunk, assignment_title: str, rubric: str = "") -> str:
    # The rubric only *steers* which points are worth making — the point must
    # still be drawn from (and its excerpt verbatim in) the passage, so the
    # grounding contract (law #1) is unchanged.
    rubric_block = (
        f"The marking rubric rewards:\n{rubric}\n"
        "Prefer points that help the student meet these criteria.\n\n"
        if rubric
        else ""
    )
    return (
        f"You are helping a student prepare for an assignment: {assignment_title}. {_RULES}\n\n"
        f"{rubric_block}"
        f"{_ctx(chunk)}\n\n"
        "Write ONE concrete thing the student should focus on for this assignment, "
        "drawn only from the passage:\n"
        "- point: one actionable sentence (what to review, understand, or practise).\n"
        "- excerpt: the exact phrase from the passage that supports it.\n"
        "Return only the JSON object."
    )
