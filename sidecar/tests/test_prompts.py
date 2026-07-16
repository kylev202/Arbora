"""Subject-aware prompt overlay (ADR-0011): math/cs get formatting instructions,
other disciplines keep the plain-text house style, and the verbatim-excerpt
contract (law #1) is reasserted in every overlay."""

from arbora_ai.generate.prompts import (
    card_prompt,
    discipline_overlay,
    note_prompt,
    quiz_prompt,
    walkthrough_lesson_prompt,
    walkthrough_overview_prompt,
)
from arbora_ai.ingest.chunk import Chunk


def _chunk() -> Chunk:
    return Chunk(
        source_id="s", text="Newton's second law: F = ma.",
        location={"type": "page", "page": 1}, index=0,
    )


def test_overlay_math_mentions_latex():
    o = discipline_overlay("math")
    assert "$$" in o and "LaTeX" in o
    # law #1 stays intact: excerpt is plain prose, not the typeset maths.
    assert "word-for-word" in o


def test_overlay_cs_has_both_code_and_math():
    # ML/algorithms are code AND maths, so cs gets both formatting blocks.
    o = discipline_overlay("cs")
    assert "fenced code block" in o
    assert "$$" in o and "LaTeX" in o
    assert "word-for-word" in o


def test_overlay_science_typesets_math():
    o = discipline_overlay("science")
    assert "$$" in o and "LaTeX" in o


def test_overlay_non_quantitative_disciplines_are_empty():
    assert discipline_overlay("general") == ""
    assert discipline_overlay("humanities") == ""


def test_prompts_inject_overlay_only_for_matching_discipline():
    chunk = _chunk()
    for build in (card_prompt, quiz_prompt, note_prompt):
        assert "LaTeX" in build(chunk, "math")
        assert "fenced code block" in build(chunk, "cs")
        # default (general) is unchanged — no formatting overlay leaks in.
        assert "LaTeX" not in build(chunk)
        assert "fenced code block" not in build(chunk)


def test_walkthrough_prompts_inject_overlay():
    # The walkthrough (week journey) surface used to be subject-blind: no overlay
    # reached its overview/lesson notes, so a maths lesson got no typeset maths.
    chunks = [_chunk()]
    assert "LaTeX" in walkthrough_overview_prompt(chunks, "Week 1", "math")
    assert "LaTeX" in walkthrough_lesson_prompt(chunks, 1, 3, "math")
    assert "fenced code block" in walkthrough_overview_prompt(chunks, "Week 1", "cs")
    assert "fenced code block" in walkthrough_lesson_prompt(chunks, 1, 3, "cs")
    # general default stays plain-text
    assert "LaTeX" not in walkthrough_lesson_prompt(chunks, 1, 3)
    assert "fenced code block" not in walkthrough_overview_prompt(chunks, "Week 1")


def test_lesson_prompt_offers_a_grounded_diagram():
    # A lesson can adapt to relational material with a grounded Mermaid diagram
    # (a review-gated visual aid), offered discipline-independently.
    prompt = walkthrough_lesson_prompt([_chunk()], 1, 3)
    assert "```mermaid" in prompt
    assert "only on the passages" in prompt


def test_lesson_prompt_anchors_full_structure_with_example():
    # Regression (2026-07-12): qwen3:8b stopped after the one-line summary when the
    # note structure was nested inside the `content:` field spec and the prompt
    # opened with "don't just list facts". Describing the structure at the top
    # level and only *referencing* it from the JSON field, plus a worked example,
    # keeps the whole multi-section note.
    prompt = walkthrough_lesson_prompt([_chunk()], 1, 3)
    assert "with this structure, in order" in prompt
    assert "content: the structured Markdown lesson above" in prompt
    assert "EXAMPLE" in prompt and "## Key ideas" in prompt and "## Takeaway" in prompt


def test_lesson_example_is_discipline_aware_and_latex_is_tight():
    # The math-discipline example typesets a formula with tight $...$ delimiters so
    # the model imitates render-safe LaTeX; the renderer treats padded "$ x $" as
    # plain text, so the overlay says so. Non-quantitative lessons get the plain
    # (no-LaTeX) example.
    math = walkthrough_lesson_prompt([_chunk()], 1, 3, "math")
    assert "$Q=mL$" in math
    assert "no spaces just inside" in math
    assert "$Q=mL$" not in walkthrough_lesson_prompt([_chunk()], 1, 3)
