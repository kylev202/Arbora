"""Live generation against a real Ollama model.

Gated: set ARBORA_RUN_INTEGRATION=1 (needs Ollama + a pulled model). Proves the
real model produces schema-valid, grounded, cited items on the low-RAM preset.
Also covers the syllabus-parse and assignment-brief paths (slice 4 + 5).
"""

import os

import pytest

from arbora_ai.generate import generate_from_chunks
from arbora_ai.generate.brief import generate_brief
from arbora_ai.generate.grounding import excerpt_grounded
from arbora_ai.ingest.chunk import Chunk
from arbora_ai.llm.provider import OllamaProvider
from arbora_ai.outline.extract import extract_outline

pytestmark = pytest.mark.skipif(
    not os.environ.get("ARBORA_RUN_INTEGRATION"),
    reason="set ARBORA_RUN_INTEGRATION=1 to run (needs Ollama + model)",
)

MODEL = os.environ.get("ARBORA_TEST_MODEL", "qwen3:8b")

CHUNKS = [
    Chunk(
        source_id="bio",
        text=(
            "The mitochondrion is the powerhouse of the cell. It carries out aerobic "
            "respiration, breaking down glucose with oxygen to produce ATP, the cell's "
            "main energy currency."
        ),
        location={"type": "page", "page": 1},
        index=0,
    ),
    Chunk(
        source_id="bio",
        text=(
            "Photosynthesis occurs in the chloroplast. Light energy is used to convert "
            "carbon dioxide and water into glucose and oxygen."
        ),
        location={"type": "page", "page": 2},
        index=1,
    ),
]


def test_real_model_generates_grounded_cards():
    provider = OllamaProvider(model=MODEL)
    assert provider.health(), "Ollama not reachable"

    result, stats = generate_from_chunks(provider, CHUNKS, types=["cards"])

    # At least one card should survive grounding on this clean, factual text.
    assert result.cards, f"no grounded cards; stats={stats['cards'].__dict__}"
    for card in result.cards:
        # Every kept card is cited to a real chunk and its excerpt is verbatim.
        assert card.source_ref.source_id == "bio"
        chunk = CHUNKS[0] if card.source_ref.location.page == 1 else CHUNKS[1]
        assert excerpt_grounded(card.source_ref.excerpt, chunk.text)


def test_real_model_parses_syllabus_outline():
    """Slice 4 E2E: real model extracts a week plan from plain-text syllabus."""
    provider = OllamaProvider(model=MODEL)
    assert provider.health(), "Ollama not reachable"

    syllabus = (
        "CS101 Introduction to Computer Science\n"
        "Week 1: Algorithms and complexity — Big-O notation, sorting.\n"
        "Week 2: Data structures — linked lists, stacks, queues.\n"
        "Week 3: Recursion and dynamic programming.\n"
        "Midterm exam due 2026-03-20\n"
        "Final project due 2026-05-15\n"
    )
    result = extract_outline(provider, syllabus)

    # Model must produce at least the three weeks and two deadlines.
    assert len(result.weeks) >= 3, f"expected ≥3 weeks, got {result.weeks}"
    assert len(result.deadlines) >= 2, f"expected ≥2 deadlines, got {result.deadlines}"

    week_numbers = [w.week_number for w in result.weeks]
    assert 1 in week_numbers and 2 in week_numbers and 3 in week_numbers

    deadline_titles = [d.title.lower() for d in result.deadlines]
    assert any("midterm" in t or "exam" in t for t in deadline_titles)
    assert any("final" in t or "project" in t for t in deadline_titles)


def test_real_model_generates_assignment_brief():
    """Slice 5 E2E: real model produces grounded, cited study brief points."""
    provider = OllamaProvider(model=MODEL)
    assert provider.health(), "Ollama not reachable"

    content, refs, stats = generate_brief(provider, CHUNKS, assignment_title="Cell biology essay")

    # At least one grounded point must survive on clean, factual text.
    assert refs, f"no grounded brief points; stats={stats.__dict__}"
    assert content.strip(), "brief content is empty"

    for ref in refs:
        # Every ref must cite a real page from the source.
        assert ref.location.page in {1, 2}
        # Excerpt must be verbatim in the chunk it's citing.
        source_chunk = CHUNKS[0] if ref.location.page == 1 else CHUNKS[1]
        assert excerpt_grounded(ref.excerpt, source_chunk.text), (
            f"grounding violated: {ref.excerpt!r} not in chunk text"
        )
