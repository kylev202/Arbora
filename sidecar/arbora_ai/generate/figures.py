"""Attach source figures to walkthrough lessons (ADR-0012), preset-gated.

A figure is a verbatim visual excerpt of the user's own PDF, extracted at ingest
and stored under the source library. A lesson may show the figures that live on
its own chunk pages — nothing else — so the picture is always traceable to the
same page the prose cites (law #1), and the note is review-gated (law #2).

Selection differs by preset:
  - capable (medium/high): the prompt offers the lesson's figures as F1, F2, …;
    the model embeds `![caption](figure:N)` where one helps. `resolve_figure_refs`
    then rewrites valid refs to the real path and DROPS everything else — the model
    can point at a real figure but never invent one or inject an arbitrary image.
  - low (Qwen3 4B): no prompt instruction (it dilutes a small model); instead
    `append_figure` deterministically appends the single largest figure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..ingest.chunk import Chunk

# Any Markdown image the model emitted: ![alt](target)
_IMG = re.compile(r"!\[([^\]]*)\]\(([^)]*)\)")


@dataclass
class LessonFigure:
    source_id: str
    page: int
    path: str
    width: int
    height: int


def figures_for_bucket(bucket: list[Chunk], figures: list[LessonFigure]) -> list[LessonFigure]:
    """The figures that sit on the same (source, page) as one of the bucket's
    chunks — deduplicated by path, in a stable order."""
    pages = {(c.source_id, c.location.get("page")) for c in bucket}
    seen: set[str] = set()
    out: list[LessonFigure] = []
    for f in figures:
        if (f.source_id, f.page) in pages and f.path not in seen:
            seen.add(f.path)
            out.append(f)
    return out


def figures_offer(bucket_figures: list[LessonFigure]) -> str:
    """Prompt overlay listing the figures a capable model may reference."""
    if not bucket_figures:
        return ""
    listing = "; ".join(f"figure:{i} (page {f.page})" for i, f in enumerate(bucket_figures, 1))
    return (
        "\nAVAILABLE FIGURES (real pictures from this lesson's own pages): "
        f"{listing}.\n"
        "- If ONE of these directly illustrates a point you make, embed it inline as "
        "`![short caption](figure:N)` (using its exact id above) at the relevant place. "
        "Use a figure only when it genuinely helps — most lessons need none. Never write "
        "an image with any other id or URL, and never invent a figure."
    )


def resolve_figure_refs(content: str, bucket_figures: list[LessonFigure]) -> str:
    """Rewrite `![cap](figure:N)` to the real figure path; strip every other image
    the model produced (invalid id, arbitrary URL) so only real, in-scope figures
    survive."""

    def repl(m: re.Match[str]) -> str:
        cap, target = m.group(1), m.group(2).strip()
        if target.startswith("figure:"):
            try:
                idx = int(target[len("figure:") :]) - 1
            except ValueError:
                return ""
            if 0 <= idx < len(bucket_figures):
                return f"![{cap}]({bucket_figures[idx].path})"
        return ""  # invalid ref or non-figure image → drop it

    return _IMG.sub(repl, content)


def append_figure(content: str, bucket_figures: list[LessonFigure]) -> str:
    """Low-preset: deterministically append the largest figure as its own section."""
    if not bucket_figures:
        return content
    fig = max(bucket_figures, key=lambda f: f.width * f.height)
    return (
        content.rstrip()
        + f"\n\n## Figure\n\n![Figure from the source (p. {fig.page})]({fig.path})"
    )
