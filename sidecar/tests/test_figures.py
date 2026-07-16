"""Preset-gated figure attachment for walkthrough lessons (ADR-0012): a lesson
shows only figures from its own pages, a capable model references them inline and
invalid/arbitrary images are stripped, and the low preset gets one appended."""

from arbora_ai.generate.figures import (
    LessonFigure,
    append_figure,
    figures_for_bucket,
    figures_offer,
    resolve_figure_refs,
)
from arbora_ai.ingest.chunk import Chunk


def _chunk(source_id: str, page: int, index: int = 0) -> Chunk:
    return Chunk(source_id=source_id, text="x", location={"type": "page", "page": page}, index=index)


def _fig(source_id: str, page: int, w: int = 400, h: int = 300, name: str = "") -> LessonFigure:
    return LessonFigure(source_id=source_id, page=page, path=name or f"/f/{source_id}-{page}.png",
                        width=w, height=h)


def test_figures_for_bucket_matches_source_and_page_only():
    bucket = [_chunk("s1", 3), _chunk("s1", 4)]
    figs = [_fig("s1", 3), _fig("s1", 9), _fig("s2", 3)]
    got = figures_for_bucket(bucket, figs)
    assert [f.page for f in got] == [3]  # page 9 (not in bucket) and s2 (other source) excluded


def test_offer_lists_figures_for_capable_model():
    offer = figures_offer([_fig("s1", 3), _fig("s1", 4)])
    assert "figure:1 (page 3)" in offer and "figure:2 (page 4)" in offer
    assert figures_offer([]) == ""


def test_resolve_rewrites_valid_ref_and_strips_the_rest():
    figs = [_fig("s1", 3, name="/lib/a.png")]
    content = (
        "Intro ![the curve](figure:1) then ![bad](figure:9) "
        "and ![evil](http://x/y.png) end"
    )
    out = resolve_figure_refs(content, figs)
    assert "![the curve](/lib/a.png)" in out  # valid ref → real path
    assert "figure:9" not in out and "http://x" not in out  # invalid + arbitrary dropped
    assert out == "Intro ![the curve](/lib/a.png) then  and  end"


def test_resolve_strips_all_when_no_figures():
    assert resolve_figure_refs("a ![x](figure:1) b", []) == "a  b"


def test_append_picks_the_largest_figure():
    content = "Body."
    figs = [_fig("s1", 3, w=100, h=100, name="/small.png"), _fig("s1", 3, w=800, h=600, name="/big.png")]
    out = append_figure(content, figs)
    assert out.startswith("Body.\n\n## Figure")
    assert "/big.png" in out and "/small.png" not in out


def test_append_noop_without_figures():
    assert append_figure("Body.", []) == "Body."
