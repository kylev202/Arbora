"""Prompt builders for practice-test items — one chunk per call, same
"use only this passage; quote it" contract as generate/prompts.py (ADR-0004).
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


def short_answer_prompt(chunk: Chunk) -> str:
    return (
        f"You write short-answer study questions. {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Create ONE short-answer question from the passage:\n"
        "- question: clear, answerable from the passage alone in one or two sentences.\n"
        "- expected_answer: the model answer, concise, supported by the passage.\n"
        "- excerpt: the exact phrase from the passage that supports the answer.\n"
        "Return only the JSON object."
    )


def matching_prompt(chunk: Chunk) -> str:
    return (
        f"You write matching exercises (terms to descriptions). {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Create ONE matching exercise from the passage:\n"
        "- instruction: one short sentence telling the student what to match.\n"
        "- pairs: 3 to 5 pairs; left = a term/concept, right = its matching "
        "description or definition from the passage. Every left and every right "
        "must be distinct.\n"
        "- excerpt: an exact phrase copied from the passage.\n"
        "Return only the JSON object."
    )


def ordering_prompt(chunk: Chunk) -> str:
    return (
        f"You write sequencing exercises. {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Create ONE put-in-order exercise from the passage (a process, sequence, "
        "or ranked structure described in it):\n"
        "- instruction: one short sentence telling the student what to order.\n"
        "- steps: 3 to 6 steps in the CORRECT order, each a short phrase.\n"
        "- excerpt: the exact phrase from the passage that describes the sequence.\n"
        "Return only the JSON object."
    )


def feynman_prompt(chunk: Chunk) -> str:
    return (
        f"You design Feynman-technique exercises (explain it simply). {_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Pick ONE central concept from the passage for the student to explain in "
        "their own words:\n"
        "- concept: the concept's name, short.\n"
        "- key_points: 2 to 4 short points a good explanation must cover, each "
        "supported by the passage.\n"
        "- excerpt: an exact phrase copied from the passage.\n"
        "Return only the JSON object."
    )


def grade_prompt(question: str, expected: str, user_answer: str) -> str:
    return (
        "You are a supportive study coach grading a student's answer. Compare the "
        "student's answer ONLY against the expected answer below — do not use any "
        "outside knowledge, and do not penalise wording differences when the "
        "meaning matches.\n\n"
        f"QUESTION / CONCEPT: {question}\n\n"
        f'EXPECTED ANSWER (the only source of truth):\n"""\n{expected}\n"""\n\n'
        f'STUDENT ANSWER:\n"""\n{user_answer}\n"""\n\n'
        "Return a JSON object with:\n"
        '- "verdict": "correct" (meaning matches), "partial" (some of it), or '
        '"incorrect" (misses or contradicts it)\n'
        '- "feedback": one to three calm, specific sentences: what was right, and '
        "what from the expected answer was missing or off. Never scold.\n"
        "Return only the JSON object."
    )
