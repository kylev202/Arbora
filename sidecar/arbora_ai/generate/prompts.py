"""Prompt builders — one chunk per call, "use only this passage; quote it".

Each prompt is layered NotebookLM-style: a pedagogical persona, hard grounding
rules, item-quality rules (what makes a *good* flashcard/quiz/note, distilled
from spaced-repetition practice), and a compact worked example so small local
models imitate shape and quality instead of guessing. The prompt pins the model
to a single chunk so the excerpt is verifiable. The model returns content + a
verbatim excerpt only; the citation (source_id + page/timestamp) is attached by
the pipeline from the chunk, not the model (ADR-0004). The schema is enforced
separately (structured output); generate/grounding.py re-checks the output
lexically and drops anything untraceable.
"""

from __future__ import annotations

from ..ingest.chunk import Chunk

_RULES = (
    "GROUNDING RULES:\n"
    "- Use ONLY the passage below. Never add facts, numbers, names, or examples "
    "that are not stated in it, even if you know them to be true.\n"
    "- The excerpt MUST be copied word-for-word from the passage (a real "
    "substring), max 200 characters.\n"
    '- Write self-contained content: never write "the passage", "the text", '
    '"this excerpt", or "the source" — the student reads your output without '
    "seeing the passage."
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


# Subject-aware overlay (ADR-0011; math-scope extended 2026-07-11 — see the ADR's
# Update note). The excerpt stays plain prose copied verbatim from the passage (law
# #1 unchanged); the equation/code is a *rendered aid* the human approves at the
# review gate (law #2). Maths is typeset for every quantitative discipline (math,
# cs, science) because formulas turn up in all of them — a gradient-descent note is
# as mathematical as a calculus one. general/humanities keep the plain-text style.
_MATH_FMT = (
    "\nMATH FORMATTING:\n"
    "- When the passage states an equation, formula, or symbolic relationship, "
    "typeset it in LaTeX: inline maths as $...$ and a standalone equation as "
    "$$...$$ on its own line. Reproduce only the mathematics the passage states — "
    "never invent steps, values, or notation to fill it out.\n"
    "- Write the $ delimiters tight against the maths, with no spaces just inside "
    "them: write $x$ and $$...$$, never $ x $ (the renderer treats a padded $ as "
    "plain text).\n"
    "- The excerpt must still be plain text copied word-for-word from the passage "
    "(the sentence that introduces or states the result), not the LaTeX you wrote."
)
_CODE_FMT = (
    "\nCODE FORMATTING:\n"
    "- When the passage shows code, pseudocode, a command, or an algorithm, present "
    "it in a fenced code block (```), preserving the logic exactly as the passage "
    "gives it — never invent code the passage does not contain.\n"
    "- The excerpt must still be plain text copied word-for-word from the passage "
    "(the sentence that introduces or describes it), not the code block you wrote."
)


def discipline_overlay(discipline: str) -> str:
    if discipline in ("math", "science"):
        return _MATH_FMT
    if discipline == "cs":  # ML/algorithms are code AND maths
        return _MATH_FMT + _CODE_FMT
    return ""


def _ctx(chunk: Chunk) -> str:
    return f'PASSAGE:\n"""\n{chunk.text}\n"""'


def card_prompt(chunk: Chunk, discipline: str = "general") -> str:
    return (
        "You are an expert university tutor writing spaced-repetition flashcards.\n\n"
        f"{_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Create ONE flashcard that tests the single most important idea in the passage:\n"
        "- front: one clear, self-contained question answerable without seeing the "
        "passage. Ask WHY or HOW when the passage explains a mechanism or reason; "
        "otherwise ask WHAT/WHICH/WHEN. Never a yes/no question.\n"
        "- back: the shortest complete answer — a phrase or one sentence in the "
        "passage's own terminology. One fact only, not a list.\n"
        "- explanation: one or two sentences of context from the passage that make "
        "the answer easier to remember.\n"
        "- excerpt: the exact sentence or phrase from the passage that proves the back.\n"
        f"{discipline_overlay(discipline)}\n\n"
        "EXAMPLE (for a different passage, about boiling water):\n"
        '{"front": "Why does water boil below 100 °C at high altitude?", '
        '"back": "Because atmospheric pressure is lower at altitude", '
        '"explanation": "Boiling starts when vapour pressure equals atmospheric '
        'pressure, so with less pressure a lower temperature is enough.", '
        '"excerpt": "at high altitude the lower atmospheric pressure reduces the '
        'boiling point"}\n\n'
        "Return only the JSON object."
    )


def quiz_prompt(chunk: Chunk, discipline: str = "general") -> str:
    return (
        "You are an expert university examiner writing one multiple-choice question.\n\n"
        f"{_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Create ONE multiple-choice question from the passage:\n"
        "- question: self-contained and answerable from the passage alone. Test "
        "understanding (why / how / what happens if) when the passage supports it, "
        "not just word recall. Never a yes/no question.\n"
        "- options: exactly 4 options of the same kind and similar length; exactly "
        "one is correct per the passage. The three wrong options must be plausible "
        "mistakes a student could actually make (related terms from the same topic, "
        'common confusions) — never obviously wrong, never "all of the above" or '
        '"none of the above".\n'
        "- answer_index: the 0-based index of the correct option.\n"
        "- explanation: why the correct option is right and why the closest wrong "
        "option is wrong, based on the passage.\n"
        "- excerpt: the exact phrase from the passage that proves the correct option.\n"
        f"{discipline_overlay(discipline)}\n\n"
        "EXAMPLE (for a different passage, about cells):\n"
        '{"question": "Which organelle produces most of a cell\'s ATP?", '
        '"options": ["Mitochondrion", "Ribosome", "Nucleus", "Golgi apparatus"], '
        '"answer_index": 0, '
        '"explanation": "Mitochondria carry out the respiration that makes ATP; '
        'ribosomes build proteins instead.", '
        '"excerpt": "mitochondria produce most of the cell\'s ATP"}\n\n'
        "Return only the JSON object."
    )


def note_prompt(chunk: Chunk, discipline: str = "general") -> str:
    return (
        "You are an expert university tutor writing clear, well-structured study notes.\n\n"
        f"{_RULES}\n\n"
        f"{_ctx(chunk)}\n\n"
        "Write ONE study note on the passage as Markdown, in order:\n"
        "1. A `## ` heading naming the topic of the passage (a few words).\n"
        "2. A one-sentence summary of what the passage covers (plain text, no heading).\n"
        "3. A few `- ` bullets on the key points, using `**bold**` to mark key terms. "
        "Define each key term in plain words the first time it appears, and when the "
        "passage explains why or how something happens, capture the mechanism, not "
        "just the fact.\n"
        "Return a JSON object with:\n"
        "- content: the structured Markdown note above, at least 20 characters.\n"
        '- format: "outline".\n'
        "- excerpt: an exact phrase copied from the passage.\n"
        f"{_NOTE_STYLE}{discipline_overlay(discipline)}\n"
        "Return only the JSON object."
    )


_MULTI_RULES = (
    "GROUNDING RULES:\n"
    "- Use ONLY the passages below. Never add facts, numbers, names, or examples "
    "that are not stated in them, even if you know them to be true.\n"
    "- Each excerpt MUST be copied word-for-word from one passage (a real "
    "substring), max 200 characters.\n"
    '- Write self-contained content: never write "the passages", "the text", or '
    '"the sources" — the student reads your output without seeing the passages.'
)


def _multi_ctx(chunks: list[Chunk]) -> str:
    return "\n\n".join(f'PASSAGE {i}:\n"""\n{c.text}\n"""' for i, c in enumerate(chunks, start=1))


def walkthrough_overview_prompt(
    chunks: list[Chunk], week_title: str, discipline: str = "general"
) -> str:
    topic = f' on "{week_title}"' if week_title else ""
    return (
        f"You are an expert university tutor writing the overview of one week of a "
        f"course{topic}. {_MULTI_RULES}\n\n"
        f"{_multi_ctx(chunks)}\n\n"
        "Write the week's overview note as Markdown with this structure, in order:\n"
        "1. A one- or two-sentence summary of what the week is about (plain text, no heading).\n"
        "2. Two or three `## ` sections covering the main ideas and how they connect — a "
        "short sentence or two then `- ` bullets in each. Prefer explaining how the "
        "ideas relate (what leads to what, what depends on what) over listing them.\n"
        "3. A final `## Key takeaways` section: 2-4 bullets of what to remember.\n"
        "Do not repeat the week title as a heading.\n"
        f"{_NOTE_STYLE}{discipline_overlay(discipline)}\n"
        "Return a JSON object with:\n"
        "- content: the structured Markdown note above.\n"
        "- excerpts: 2-4 exact phrases copied from the passages that support the overview.\n"
        "Return only the JSON object."
    )


# A compact worked example (different topic — shape only) so a small local model
# reliably fills the whole multi-section note instead of stopping after the
# one-line summary. Without it, short or dense passages (e.g. a few terse maths
# sentences) still truncate on qwen3:8b even with the corrected framing — the
# example lifts those from ~80 to ~950 chars (verified 2026-07-12). Same posture
# as the card/quiz examples: illustrative content, never a source to copy from.
_LESSON_EXAMPLE = (
    "\nEXAMPLE (a different topic — copy this SHAPE and length, never its content):\n"
    '{"title": "Changes of state", '
    '"content": "Matter changes state when heat is added or removed.\\n\\n'
    "## Key ideas\\nState changes are driven by energy transfer between a "
    "substance and its surroundings.\\n"
    "- **Melting** is the change from solid to liquid as heat is absorbed.\\n"
    "- **Evaporation** turns a liquid into a gas at its surface.\\n\\n"
    "## How it works\\n1. Adding heat raises the average kinetic energy of the "
    "molecules.\\n2. Once their bonds break, the substance shifts to the next "
    'state.\\n\\n## Takeaway\\n- A state change is an energy change, not a change '
    'of substance.", '
    '"excerpts": ["Melting is the change from solid to liquid", '
    '"Evaporation turns a liquid into a gas"]}\n'
)

# Math-discipline variant: same shape, but demonstrates tight inline/display LaTeX
# so the model typesets the passage's formulas (ADR-0011) instead of leaving them
# as ASCII. Used for math/science/cs; the plain example above is used otherwise.
_LESSON_EXAMPLE_MATH = (
    "\nEXAMPLE (a different topic — copy this SHAPE, formatting, and length, never "
    "its content):\n"
    '{"title": "Latent heat", '
    '"content": "The heat a state change needs depends on the mass and the material.\\n\\n'
    "## Key ideas\\nA state change absorbs or releases energy at constant temperature.\\n"
    "- **Latent heat** $L$ is the energy per unit mass to change state, so the total "
    "heat is $Q=mL$.\\n"
    "- **Melting** absorbs heat without raising the temperature.\\n\\n"
    "## How it works\\n1. Added heat breaks intermolecular bonds rather than raising "
    "temperature.\\n2. The energy for a sample of mass $m$ follows $$Q=mL.$$\\n\\n"
    '## Takeaway\\n- A state change is an energy change described by $Q=mL$.", '
    '"excerpts": ["Latent heat is the energy per unit mass", '
    '"Melting absorbs heat"]}\n'
)


def _lesson_example(discipline: str) -> str:
    """Match the example to the discipline overlay: a LaTeX-typeset example where
    maths is expected (math/science/cs), the plain one otherwise."""
    return _LESSON_EXAMPLE_MATH if discipline in ("math", "science", "cs") else _LESSON_EXAMPLE


def walkthrough_lesson_prompt(
    chunks: list[Chunk],
    lesson_number: int,
    lesson_total: int,
    discipline: str = "general",
    figures_offer: str = "",
) -> str:
    # The note structure is described as the top-level task and only *referenced*
    # from the JSON spec (mirroring walkthrough_overview_prompt). Nesting the
    # structure inside the `content` field spec, or opening with "teach the idea,
    # don't just list facts", makes a small model (qwen3:8b) emit only the one-line
    # summary and stop — verified 2026-07-12. The neutral "write this note with
    # this structure" framing produces the full multi-section note.
    return (
        f"You are an expert university tutor writing one small, focused lesson note — "
        f"part {lesson_number} of {lesson_total} of a week's study journey. {_MULTI_RULES}\n\n"
        f"{_multi_ctx(chunks)}\n\n"
        "Write this lesson note as Markdown with this structure, in order:\n"
        "1. A one- or two-sentence summary of the lesson (plain text, no heading).\n"
        "2. A `## Key ideas` section: a short explanation then 3-6 `- ` bullets of the "
        "key facts from the passages. Define each key term in plain words on first "
        "mention; when the passages explain why or how something works, capture the "
        "mechanism, not just the fact.\n"
        "3. THEN add whichever ONE of these sections best fits the material — pick the "
        "single most useful one, and skip this step entirely if none fits, never "
        "inventing content to fill it:\n"
        "   - `## How it works` with numbered `1. ` steps, when the passages describe "
        "a process, derivation, or algorithm; or\n"
        "   - `## Example` with one concrete worked example, when the passages give one; or\n"
        "   - `## Diagram` with a Mermaid diagram in a ```mermaid fenced block, when the "
        "passages describe how things relate, connect, or flow. Use `graph TD` syntax, short "
        "node labels of 2-5 words, at most 8 nodes; base every node and edge only on the "
        "passages.\n"
        "4. A `## Takeaway` section: one or two bullets on what matters most.\n"
        "Do not repeat the title as a heading.\n"
        f"{_NOTE_STYLE}{discipline_overlay(discipline)}{figures_offer}\n"
        "Return a JSON object with:\n"
        "- title: a short name for what this lesson teaches (a few words).\n"
        "- content: the structured Markdown lesson above.\n"
        "- excerpts: 2-4 exact phrases copied from the passages that support the lesson.\n"
        f"{_lesson_example(discipline)}"
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
        f"You are an expert university tutor helping a student prepare for an "
        f"assignment: {assignment_title}.\n\n{_RULES}\n\n"
        f"{rubric_block}"
        f"{_ctx(chunk)}\n\n"
        "Write ONE concrete thing the student should focus on for this assignment, "
        "drawn only from the passage:\n"
        "- point: one actionable sentence (what to review, understand, or practise), "
        "specific enough to act on today.\n"
        "- excerpt: the exact phrase from the passage that supports it.\n"
        "Return only the JSON object."
    )
