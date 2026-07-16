"""Extract a PDF's own embedded figures at ingest (ADR-0012).

A figure is a *verbatim visual excerpt* of the user's document — the labelled
diagram, plotted curve, or photo a lecture puts on a page. We pull the embedded
raster images out with PyMuPDF, drop the chrome (logos, rules, watermarks) with a
size/shape/repetition filter, normalise each to PNG, and write it under the
source library so the note renderer can show it via the asset scope. The sidecar
owns the files (same split as FAISS); it returns metadata for the Rust core to
persist in `source_figures`.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# Filter thresholds — keep real figures, drop icons/rules/banners.
MIN_W = 200
MIN_H = 150
MIN_ASPECT = 0.2  # width/height; below this is a vertical rule/spine
MAX_ASPECT = 6.0  # above this is a horizontal banner/divider
MAX_FIGURES = 60  # hard cap per source so a figure-dense PDF can't flood the library


@dataclass
class Figure:
    """One kept figure. `path` is absolute; `page` is 1-based (matches SourceRef)."""

    page: int
    path: str
    width: int
    height: int


def _is_chrome(page_count: int, occurrences: int) -> bool:
    """An image reused across many pages is a logo/watermark, not a figure."""
    return occurrences > max(4, page_count // 2)


def extract_pdf_figures(pdf_path: str | Path, out_dir: str | Path, source_id: str) -> list[Figure]:
    """Write each kept figure to `out_dir/{source_id}/{xref}.png` and return their
    metadata. Best-effort: a page or image that cannot be decoded is skipped, never
    fatal to ingest. Returns [] for a PDF with no qualifying figures."""
    import pymupdf

    dest = Path(out_dir) / source_id
    dest.mkdir(parents=True, exist_ok=True)

    figures: list[Figure] = []
    with pymupdf.open(str(pdf_path)) as doc:
        page_count = doc.page_count
        # First pass: how many pages each image xref appears on (chrome detection).
        occurrences: dict[int, int] = {}
        per_page: list[list[int]] = []
        for page in doc:
            xrefs = [img[0] for img in page.get_images(full=True)]
            per_page.append(xrefs)
            for xref in set(xrefs):
                occurrences[xref] = occurrences.get(xref, 0) + 1

        seen: set[int] = set()
        for page_index, xrefs in enumerate(per_page):
            for xref in xrefs:
                if xref in seen or _is_chrome(page_count, occurrences.get(xref, 1)):
                    continue
                seen.add(xref)
                try:
                    pix = pymupdf.Pixmap(doc, xref)
                    if pix.colorspace is not None and pix.colorspace.n >= 4:  # CMYK → RGB
                        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                    w, h = pix.width, pix.height
                    if w < MIN_W or h < MIN_H or not (MIN_ASPECT <= w / h <= MAX_ASPECT):
                        continue
                    path = dest / f"{xref}.png"
                    pix.save(str(path))
                except Exception:
                    continue  # unreadable/exotic image object — skip it, keep ingesting
                figures.append(Figure(page=page_index + 1, path=str(path), width=w, height=h))
                if len(figures) >= MAX_FIGURES:
                    return figures
    return figures
