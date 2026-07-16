"""Deterministic math-delimiter cleanup for generated note Markdown.

The prompts ask for tight `$x$` delimiters (ADR-0011), but small local models
comply only inconsistently — the same prompt yields `$x$` one run and `$ x $`
the next. The note renderer treats a padded `$` as plain text on purpose (so
"$5 and $10" in prose is never mistaken for math), which turns a padded formula
into raw dollar signs on screen. Tightening here, after validation, makes the
rendering deterministic regardless of which way the model went — same posture
as the quiz option shuffle in pipeline.py.
"""

from __future__ import annotations

import re

# Every minimal single-`$` pair on a line, paired leftmost like a renderer
# would. Consuming non-math pairs too is what keeps the rewrite safe: a `$`
# that already closed one span can never open a false span across the prose
# after it. `(?<!\$)`/`(?!\$)` keep block `$$…$$` out of the inline pass — the
# renderer already trims padding inside block math.
_PAIR = re.compile(r"(?<!\$)\$(?!\$)((?:\\\$|[^$\n])+?)\$(?!\$)")

# Fenced code blocks are kept verbatim (a `$` in code is not math).
_FENCE = re.compile(r"```.*?(?:```|\Z)", re.DOTALL)


def _tighten_pair(m: re.Match[str]) -> str:
    """Rewrite `$ x $` → `$x$`. Symmetric padding only: currency never puts a
    space *after* the `$` ("costs $5 and $10"), so prose pairs stay verbatim;
    one-sided padding (`$x $`) is deliberately left alone for the same reason."""
    body = m.group(1)
    tight = body.strip(" \t")
    if tight and body[0] in " \t" and body[-1] in " \t":
        return f"${tight}$"
    return m.group(0)


def tighten_math(content: str) -> str:
    """Rewrite padded inline math (`$ x $` → `$x$`) outside fenced code blocks."""
    out: list[str] = []
    last = 0
    for fence in _FENCE.finditer(content):
        out.append(_PAIR.sub(_tighten_pair, content[last : fence.start()]))
        out.append(fence.group(0))
        last = fence.end()
    out.append(_PAIR.sub(_tighten_pair, content[last:]))
    return "".join(out)
