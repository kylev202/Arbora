from arbora_ai.generate import grounding
from arbora_ai.ingest.chunk import Chunk
from arbora_ai.schemas.output import CardOut, PageLocation, QuizItemOut, SourceRef

CHUNK = Chunk(
    source_id="bio",
    text="The eardrum vibrates to transmit sound waves into the middle ear.",
    location={"type": "page", "page": 5},
    index=0,
)


def _card(front, back, excerpt):
    return CardOut(
        front=front,
        back=back,
        explanation="",
        source_ref=SourceRef(
            source_id="x", location=PageLocation(page=99), excerpt=excerpt
        ),
    )


def test_excerpt_grounded_verbatim():
    assert grounding.excerpt_grounded("the eardrum vibrates", CHUNK.text)
    # case + whitespace tolerant
    assert grounding.excerpt_grounded("THE   EARDRUM\nvibrates", CHUNK.text)


def test_excerpt_not_grounded_when_paraphrased():
    assert not grounding.excerpt_grounded("the eardrum shakes a lot", CHUNK.text)


def test_location_from_chunk():
    loc = grounding.location_from_chunk(CHUNK)
    assert isinstance(loc, PageLocation) and loc.page == 5


def test_check_card_drops_ungrounded_excerpt():
    card = _card("What transmits sound?", "The eardrum", "not in the passage at all")
    assert grounding.check_card(card, CHUNK) is not None


def test_check_card_drops_front_equals_back():
    card = _card("the eardrum", "the eardrum", "the eardrum vibrates")
    assert grounding.check_card(card, CHUNK) == "front equals back"


def test_check_card_passes_when_grounded():
    card = _card("What vibrates to transmit sound?", "The eardrum", "the eardrum vibrates")
    assert grounding.check_card(card, CHUNK) is None


def test_check_quiz_distinct_options():
    quiz = QuizItemOut(
        question="What vibrates?",
        options=["eardrum", "eardrum", "bone", "nerve"],
        answer_index=0,
        explanation="",
        source_ref=SourceRef(source_id="bio", location=PageLocation(page=5), excerpt="the eardrum vibrates"),
    )
    assert grounding.check_quiz(quiz, CHUNK) == "options not distinct"


def test_check_card_drops_meta_reference():
    card = _card("According to the passage, what vibrates?", "The eardrum", "the eardrum vibrates")
    assert grounding.check_card(card, CHUNK) == "refers to the source material"


def test_check_card_drops_unsupported_back():
    # Excerpt is real, but the answer names something the passage never says —
    # the model reached for its own knowledge (the failure mode law #1 targets).
    card = _card("What transmits sound?", "The cochlear amplifier", "the eardrum vibrates")
    assert grounding.check_card(card, CHUNK) == "answer not supported by the passage"


def test_answer_supported_tolerates_inflection():
    assert grounding.answer_supported("vibration of the eardrum", CHUNK.text)


def test_check_quiz_drops_unsupported_correct_option():
    quiz = QuizItemOut(
        question="What vibrates?",
        options=["cochlea", "hammer", "anvil", "stirrup"],
        answer_index=0,
        explanation="",
        source_ref=SourceRef(source_id="bio", location=PageLocation(page=5), excerpt="the eardrum vibrates"),
    )
    assert grounding.check_quiz(quiz, CHUNK) == "correct option not supported by the passage"


def test_check_quiz_passes_when_correct_option_grounded():
    quiz = QuizItemOut(
        question="What vibrates to transmit sound?",
        options=["eardrum", "cochlea", "hammer", "anvil"],
        answer_index=0,
        explanation="",
        source_ref=SourceRef(source_id="bio", location=PageLocation(page=5), excerpt="the eardrum vibrates"),
    )
    assert grounding.check_quiz(quiz, CHUNK) is None
