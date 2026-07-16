"""Pipeline logic, tested with a fake provider (no Ollama needed)."""

from arbora_ai.generate.pipeline import generate_from_chunks
from arbora_ai.ingest.chunk import Chunk
from arbora_ai.llm.provider import LLMProvider


class FakeProvider(LLMProvider):
    """Returns a canned gen-card based on what's in the prompt (chunk text).
    The model returns content + excerpt only; the pipeline attaches the citation."""

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        if "eardrum" in prompt:
            return {"front": "What vibrates to transmit sound?", "back": "The eardrum",
                    "explanation": "", "excerpt": "the eardrum vibrates"}
        if "mitochondria" in prompt:
            # excerpt is NOT a substring of the chunk → must be dropped (grounding)
            return {"front": "What makes ATP?", "back": "Mitochondria",
                    "explanation": "", "excerpt": "mitochondria are the powerhouse"}
        if "ribosome" in prompt:
            return {"front": "What builds proteins?", "explanation": "", "excerpt": "ribosomes build"}  # no 'back'
        return {"front": "filler?", "back": "filler", "explanation": "", "excerpt": "x"}


def _chunk(text, idx):
    return Chunk(source_id="bio", text=text, location={"type": "page", "page": idx + 1}, index=idx)


def test_pipeline_keeps_grounded_drops_ungrounded_and_malformed():
    chunks = [
        _chunk("the eardrum vibrates to transmit sound waves", 0),
        _chunk("mitochondria make ATP for the cell", 1),
        _chunk("ribosomes build proteins in the cell", 2),
        _chunk("here the eardrum vibrates yet again in detail", 3),  # dup front
    ]
    result, stats = generate_from_chunks(FakeProvider(), chunks, types=["cards"])
    s = stats["cards"]

    assert s.attempts == 4
    assert s.accepted == 1  # only the first grounded, unique card
    assert s.grounding_drops == 1  # mitochondria excerpt not in chunk
    assert s.structure_fails == 1  # ribosome card missing 'back'
    assert s.dedupe_drops == 1  # duplicate eardrum front
    assert len(result.cards) == 1

    kept = result.cards[0]
    # citation anchored to the real chunk it came from (page 1), not the model's 99
    assert kept.source_ref.source_id == "bio"
    assert kept.source_ref.location.page == 1


class FakeQuizProvider(LLMProvider):
    """Always returns the same quiz with the correct answer first (the position
    bias small models exhibit)."""

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        return {
            "question": "What vibrates to transmit sound?",
            "options": ["the eardrum", "the cochlea", "the hammer", "the anvil"],
            "answer_index": 0,
            "explanation": "",
            "excerpt": "the eardrum vibrates",
        }


def test_quiz_options_shuffled_answer_remapped_and_duplicates_dropped():
    chunks = [
        _chunk("the eardrum vibrates to transmit sound waves", 0),
        _chunk("again the eardrum vibrates to transmit sound", 1),  # same question → dedupe
    ]
    result, stats = generate_from_chunks(FakeQuizProvider(), chunks, types=["quiz"])
    s = stats["quiz"]

    assert s.accepted == 1
    assert s.dedupe_drops == 1
    item = result.quiz_items[0]
    # all four options survive the shuffle and answer_index still names the correct one
    assert set(item.options) == {"the eardrum", "the cochlea", "the hammer", "the anvil"}
    assert item.options[item.answer_index] == "the eardrum"
