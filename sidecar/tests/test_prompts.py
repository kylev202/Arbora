"""Subject-aware prompt overlays (ADR-0011): the plain-text surfaces (cards/
quizzes) get formatting only for quantitative disciplines, the note surfaces
carry material-driven math formatting under every discipline label, and the
verbatim-excerpt contract (law #1) is reasserted in every overlay."""

from arbora_ai.generate.prompts import (
    card_prompt,
    discipline_overlay,
    note_overlay,
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
    # The plain-text (card/quiz) overlay stays discipline-gated.
    assert discipline_overlay("general") == ""
    assert discipline_overlay("humanities") == ""


def test_note_overlay_is_material_driven():
    # Note surfaces render KaTeX, and formulas turn up under any subject label,
    # so the (self-conditional) math block rides along for every discipline;
    # code formatting stays cs-only. ADR-0011, 2026-07-16 Update note.
    for discipline in ("general", "humanities", "math", "science", "cs"):
        o = note_overlay(discipline)
        assert "$$" in o and "LaTeX" in o
        assert "word-for-word" in o
    assert "fenced code block" in note_overlay("cs")
    assert "fenced code block" not in note_overlay("general")


def test_math_overlay_explains_symbols_and_aligns_derivations():
    # A typeset equation must be followed by a plain-words meaning for each
    # symbol, and multi-step derivations stay in one aligned display block.
    o = note_overlay("general")
    assert "what each" in o and "symbol" in o
    assert "\\begin{aligned}" in o


def test_card_quiz_prompts_gate_overlay_by_discipline():
    # Cards/quizzes render plain text (no LaTeX/TTS support yet), so their
    # overlay is discipline-gated and absent by default.
    chunk = _chunk()
    for build in (card_prompt, quiz_prompt):
        assert "LaTeX" in build(chunk, "math")
        assert "fenced code block" in build(chunk, "cs")
        assert "LaTeX" not in build(chunk)
        assert "fenced code block" not in build(chunk)


def test_note_prompt_carries_math_under_every_discipline():
    chunk = _chunk()
    assert "LaTeX" in note_prompt(chunk)
    assert "LaTeX" in note_prompt(chunk, "humanities")
    assert "fenced code block" in note_prompt(chunk, "cs")
    assert "fenced code block" not in note_prompt(chunk)


def test_note_prompt_demands_specific_headings():
    # The note's heading must name the concept, not a vague label, and each
    # distinct idea gets its own subheading — a student scanning the combined
    # notes list navigates by these.
    prompt = note_prompt(_chunk())
    assert "names the specific concept" in prompt
    assert "### " in prompt


def test_walkthrough_prompts_carry_math_for_all_disciplines():
    chunks = [_chunk()]
    for discipline in ("general", "math", "cs"):
        assert "LaTeX" in walkthrough_overview_prompt(chunks, "Week 1", discipline)
        assert "LaTeX" in walkthrough_lesson_prompt(chunks, 1, 3, discipline)
    assert "fenced code block" in walkthrough_overview_prompt(chunks, "Week 1", "cs")
    assert "fenced code block" in walkthrough_lesson_prompt(chunks, 1, 3, "cs")
    # code stays cs-only
    assert "fenced code block" not in walkthrough_overview_prompt(chunks, "Week 1")
    assert "fenced code block" not in walkthrough_lesson_prompt(chunks, 1, 3)


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
    assert "EXAMPLE" in prompt and "## Takeaway" in prompt


def test_lesson_prompt_demands_concept_named_sections_covering_everything():
    # One section per concept in the material, named after what it explains —
    # never the old fixed generic template — and full coverage of the passages.
    prompt = walkthrough_lesson_prompt([_chunk()], 1, 3)
    assert "EACH distinct concept" in prompt
    assert "never a generic label" in prompt
    assert "cover everything the passages teach" in prompt
    # the worked example demonstrates concept-named headings, not generic ones
    # (the only "## Key ideas" left is the instruction naming it as forbidden).
    assert "## Melting: solid to liquid" in prompt
    assert "## Key ideas\\n" not in prompt


def test_lesson_example_is_discipline_aware_and_latex_is_tight():
    # The math-discipline example typesets a formula with tight $...$ delimiters so
    # the model imitates render-safe LaTeX; the renderer treats padded "$ x $" as
    # plain text, so the overlay says so. It also models the "where $m$ is the…"
    # symbol-explanation line. Non-quantitative lessons get the plain example.
    math = walkthrough_lesson_prompt([_chunk()], 1, 3, "math")
    assert "$Q=mL$" in math
    assert "where $Q$ is the heat absorbed" in math
    assert "no spaces just inside" in math
    assert "$Q=mL$" not in walkthrough_lesson_prompt([_chunk()], 1, 3)
