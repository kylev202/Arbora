"""Week walkthrough pipeline: grounded overview + lesson notes.

A fake provider stands in for Ollama, keyed on the prompt kind. Grounded
excerpts are kept with authoritative citations; ungrounded ones are dropped —
and a walkthrough with no groundable overview fails, never invents.
"""

from __future__ import annotations

import pytest

from arbora_ai.generate.walkthrough import (
    _buckets,
    generate_walkthrough,
    lesson_count,
)
from arbora_ai.ingest.chunk import Chunk
from arbora_ai.llm.provider import LLMProvider

TEXTS = [
    "Photosynthesis converts light energy into chemical energy in chloroplasts.",
    "Chlorophyll absorbs mainly red and blue light, reflecting green light.",
    "Cellular respiration releases energy from glucose in the mitochondria.",
    "Glycolysis splits glucose into pyruvate in the cytoplasm.",
]


def _chunk(text: str, idx: int) -> Chunk:
    return Chunk(source_id="bio", text=text, location={"type": "page", "page": idx + 1}, index=idx)


CHUNKS = [_chunk(t, i) for i, t in enumerate(TEXTS)]


class FakeProvider(LLMProvider):
    """Overview cites two passages (one excerpt ungrounded → dropped, others
    kept); each lesson cites its own bucket."""

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        if "overview" in prompt:
            return {
                "content": "This week covers how cells capture and release energy.",
                "excerpts": [
                    "converts light energy into chemical energy",
                    "not actually in any passage",  # ungrounded → dropped
                    "releases energy from glucose",
                ],
            }
        if "Photosynthesis" in prompt:
            return {
                "title": "Capturing light",
                "content": "How chloroplasts turn light into usable chemical energy.",
                "excerpts": ["Chlorophyll absorbs mainly red and blue light"],
            }
        return {
            "title": "Releasing energy",
            "content": "How respiration frees the energy stored in glucose.",
            "excerpts": ["splits glucose into pyruvate"],
        }


def test_walkthrough_grounded_end_to_end():
    progress: list[tuple[int, int, int]] = []
    result, stats = generate_walkthrough(
        FakeProvider(), CHUNKS, week_title="Cell energy", progress_cb=lambda d, t, a: progress.append((d, t, a))
    )

    # Overview kept with only the grounded excerpts, cited authoritatively.
    assert "energy" in result.overview
    assert len(result.overview_refs) == 2
    assert result.overview_refs[0].location.page == 1
    assert result.overview_refs[1].location.page == 3

    # 4 chunks → 1 lesson bucket; its citation is anchored to its own passage.
    assert len(result.lessons) == 1
    lesson = result.lessons[0]
    assert lesson.title == "Capturing light"
    assert lesson.source_refs[0].location.page == 2
    # chunk_refs echo the whole bucket so the core can scope practice questions.
    assert [c.chunk_index for c in lesson.chunk_refs] == [0, 1, 2, 3]

    assert stats.accepted == 2
    # progress ticks once per unit (overview + each lesson), ends complete.
    assert progress[-1][0] == progress[-1][1] == 2


def test_walkthrough_skips_ungrounded_lesson():
    class UngroundedLessons(FakeProvider):
        def generate(self, prompt, schema=None, temperature=0.1):
            out = super().generate(prompt, schema, temperature)
            if "lesson" in prompt:
                out["excerpts"] = ["nowhere to be found"]
            return out

    many = [_chunk(t, i) for i, t in enumerate(TEXTS * 3)]  # 12 chunks → 2 buckets
    with pytest.raises(ValueError, match="NO_LESSONS"):
        generate_walkthrough(UngroundedLessons(), many)


def test_walkthrough_fails_without_grounded_overview():
    class UngroundedOverview(FakeProvider):
        def generate(self, prompt, schema=None, temperature=0.1):
            out = super().generate(prompt, schema, temperature)
            if "overview" in prompt:
                out["excerpts"] = ["completely invented phrase"]
            return out

    with pytest.raises(ValueError, match="NO_OVERVIEW"):
        generate_walkthrough(UngroundedOverview(), CHUNKS)


def test_walkthrough_requires_chunks():
    with pytest.raises(ValueError, match="NO_CHUNKS"):
        generate_walkthrough(FakeProvider(), [])


def test_lesson_count_and_buckets():
    assert lesson_count(1) == 1
    assert lesson_count(6) == 1
    assert lesson_count(7) == 2
    assert lesson_count(200) == 5  # capped

    buckets = _buckets(CHUNKS, 3)
    assert [len(b) for b in buckets] == [2, 1, 1]  # near-equal contiguous runs
    assert [c.index for b in buckets for c in b] == [0, 1, 2, 3]  # order kept
