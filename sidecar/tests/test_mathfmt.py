"""tighten_math: padded `$ x $` (which the renderer shows as raw text) becomes
`$x$`, while prose dollars, code, and block math are left untouched."""

from arbora_ai.generate.mathfmt import tighten_math
from arbora_ai.generate.pipeline import generate_from_chunks
from arbora_ai.ingest.chunk import Chunk
from arbora_ai.llm.provider import LLMProvider


def test_padded_inline_math_is_tightened():
    src = r"Formula: $ f_\theta(x) = W_2 \sigma(W_1x + b_1) + b_2 $, where $ W_1, b_1 $ are weights."
    assert tighten_math(src) == (
        r"Formula: $f_\theta(x) = W_2 \sigma(W_1x + b_1) + b_2$, where $W_1, b_1$ are weights."
    )


def test_tight_math_is_unchanged():
    src = "The equation $Q=mL$ and block\n$$Q=mL$$\nstay as they are."
    assert tighten_math(src) == src


def test_currency_prose_is_never_touched():
    # No space after a currency `$`, so symmetric padding can't match.
    for src in ("it costs $5 and $10 later", "prices rose 5$ to 10$", "the $ symbol"):
        assert tighten_math(src) == src


def test_one_sided_padding_is_left_alone():
    # Deliberately conservative: only symmetric `$ x $` is provably math. Two
    # one-sided spans on a line must not cross-pair into a false symmetric match
    # that swallows the prose between them.
    src = "a $x $ b and c $ y$ d"
    assert tighten_math(src) == src


def test_block_math_padding_is_left_to_the_renderer():
    src = "$$ z_1 = W_1x + b_1 $$"
    assert tighten_math(src) == src


def test_fenced_code_is_verbatim():
    src = "before $ a+b $ mid\n```sh\necho $ HOME $ done\n```\nafter $ c $ end"
    assert tighten_math(src) == (
        "before $a+b$ mid\n```sh\necho $ HOME $ done\n```\nafter $c$ end"
    )


class FakeNoteProvider(LLMProvider):
    """Returns a note whose maths is padded the way small models sometimes emit it."""

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        return {
            "content": "## The heat equation\nTotal heat: $ Q=mL $ for mass $ m $.",
            "format": "outline",
            "excerpt": "the heat a state change needs",
        }


def test_pipeline_tightens_note_math():
    chunk = Chunk(
        source_id="phys",
        text="the heat a state change needs grows with mass",
        location={"type": "page", "page": 1},
        index=0,
    )
    result, _ = generate_from_chunks(FakeNoteProvider(), [chunk], types=["notes"])
    assert result.notes[0].content == "## The heat equation\nTotal heat: $Q=mL$ for mass $m$."
