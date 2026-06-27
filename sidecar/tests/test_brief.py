"""Assignment study brief (slice 5): grounded focus points → one brief.

A fake provider stands in for Ollama. Its excerpts are verbatim substrings of the
chunk text, so the grounding check keeps them — and one isn't, so it's dropped.
"""

from __future__ import annotations

from arbora_ai.generate.brief import generate_brief
from arbora_ai.ingest.chunk import Chunk
from arbora_ai.llm.provider import LLMProvider

CHUNK_A = "Photosynthesis converts light energy into chemical energy in chloroplasts."
CHUNK_B = "Cellular respiration releases energy from glucose in the mitochondria."
CHUNK_C = "The cell membrane is a phospholipid bilayer controlling what enters the cell."


class FakeProvider(LLMProvider):
    """Returns a focus point per chunk; CHUNK_B's excerpt is NOT in the chunk so
    it must be dropped by the grounding check."""

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        if "Photosynthesis" in prompt:
            return {"point": "Review how light energy becomes chemical energy.",
                    "excerpt": "converts light energy into chemical energy"}
        if "respiration" in prompt:
            return {"point": "Understand where energy is released.",
                    "excerpt": "the powerhouse of the cell"}  # not in chunk → dropped
        if "membrane" in prompt:
            return {"point": "Know the structure of the cell membrane.",
                    "excerpt": "phospholipid bilayer"}
        return {"point": "Generic filler point to review.", "excerpt": "x"}


def _chunk(text, idx):
    return Chunk(source_id="bio", text=text, location={"type": "page", "page": idx + 1}, index=idx)


def test_generate_brief_keeps_grounded_drops_ungrounded():
    chunks = [_chunk(CHUNK_A, 0), _chunk(CHUNK_B, 1), _chunk(CHUNK_C, 2)]
    content, refs, stats = generate_brief(FakeProvider(), chunks, "Bio essay")

    assert stats.accepted == 2  # A and C grounded; B dropped
    assert stats.grounding_drops == 1
    assert len(refs) == 2
    # content is a markdown bullet list, one line per kept point
    assert content.count("\n- ") + content.count("- ") >= 2
    assert "light energy" in content
    # citations are authoritative — anchored to the chunk they came from
    assert refs[0].location.page == 1
    assert refs[1].location.page == 3  # C is page 3, B (page 2) was dropped


def test_generate_brief_respects_max_points():
    chunks = [_chunk(CHUNK_A, i) for i in range(10)]
    # Every chunk grounds, but dedupe collapses identical points to one.
    content, refs, _ = generate_brief(FakeProvider(), chunks, "Bio essay", max_points=3)
    assert len(refs) == 1  # same point text deduped


def test_generate_brief_empty_when_nothing_grounds():
    # excerpt never in chunk → no points kept, brief is empty (never invented)
    class Ungrounded(LLMProvider):
        def health(self):
            return True

        def generate(self, prompt, schema=None, temperature=0.1):
            return {"point": "A point with no real support.", "excerpt": "not present anywhere"}

    content, refs, stats = generate_brief(Ungrounded(), [_chunk(CHUNK_A, 0)], "Essay")
    assert content == ""
    assert refs == []
    assert stats.grounding_drops == 1
