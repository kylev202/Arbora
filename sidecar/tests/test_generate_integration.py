"""Live generation against a real Ollama model.

Gated: set ARBORA_RUN_INTEGRATION=1 (needs Ollama + a pulled model). Proves the
real model produces schema-valid, grounded, cited items on the low-RAM preset.
"""

import os

import pytest

from arbora_ai.generate import generate_from_chunks
from arbora_ai.generate.grounding import excerpt_grounded
from arbora_ai.ingest.chunk import Chunk
from arbora_ai.llm.provider import OllamaProvider

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
