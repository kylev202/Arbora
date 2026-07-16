# ADR-0012: Cropped source figures in generated notes

- **Status:** Accepted
- **Date:** 2026-07-11

## Context

Generated notes are text-only. ADR-0011 added typeset maths and code blocks, and
the walkthrough now offers a synthesized Mermaid diagram (a *drawn* aid). But a
lecture's own figures — the labelled diagram, the plotted curve, the anatomical
photo — are often the single most memorable artefact on a page, and today they are
thrown away at ingest: `parse_pdf` keeps `page.get_text()` and nothing else.

Users asked for "a cropped picture taken from the source" inside notes. Unlike a
synthesized equation or Mermaid graph, a source figure is not *generated* content
at all — it is a verbatim visual excerpt of the user's own document. That makes its
grounding posture different from (and stronger than) ADR-0011's synthesized aids.

The obstacles: the note house style forbids images and `NoteMarkdown` does not
render them; there is no store for extracted images or a table to cite them by;
and figures must reach the webview through the pinned asset scope
(`$APPDATA/sources/**`) without widening it.

## Decision (proposed)

Treat a source figure as a **verbatim visual excerpt**, cited exactly like a text
excerpt and governed by the same laws.

- **Extraction (ingest, Python).** At PDF ingest, extract embedded raster images
  via PyMuPDF (`page.get_images` → `doc.extract_image`), filtered to real figures
  (minimum dimension/area, sane aspect ratio) to drop logos and rules. Each figure
  is written under the library (`$APPDATA/sources/figures/{source_id}/{n}.png`) with
  its 1-based page recorded. Slides/audio/text are unchanged this slice.
- **Storage (DB).** A new `source_figures` table (`id, source_id, page, path,
  width, height, created_at`), one row per kept figure, `ON DELETE CASCADE` with
  its source. Migration `0019_source_figures.sql`.
- **Grounding (Law #1).** A figure is inherently traceable — it *is* the source
  pixels — so its citation is `source_id` + `page` + the stored crop. The model can
  never invent a figure: generation only ever attaches a figure from the fixed
  extracted set for the note's own chunk pages, and any reference that does not
  resolve to a real row is dropped. Law #1 holds at least as strongly as for text.
- **Review-before-trust (Law #2).** A figure is attached to a walkthrough lesson
  staged `reviewed = 0`; the human sees it in the inline gate before it is trusted,
  exactly as for the note's prose.
- **Selection — preset-gated.** Capability differs sharply between presets, so
  selection does too:
  - **Capable model (medium/high preset):** the lesson prompt is offered the
    figures available on its chunk pages (`[F1: page 3] …`) and may reference one
    inline as `![caption](figure:F1)` at the contextually right point. The pipeline
    then **validates every reference against the extracted set and drops any that
    does not resolve** (the model can point at a real figure, never invent one).
  - **Low preset (Qwen3 4B):** no figure instruction in the prompt (it dilutes a
    4B model). Instead the pipeline **deterministically appends at most one figure**
    per lesson — the largest figure among the lesson's chunk pages — as a `## Figure`
    section captioned with the source title.
  Both paths are fully grounded and both stage `reviewed = 0` for the human gate.
- **Rendering.** The lesson payload carries the figure's stored path alongside its
  content; `NoteMarkdown` renders it as a captioned image resolved through
  `convertFileSrc` (the asset scope already permits `$APPDATA/sources/**` — no
  widening). A missing/failed image degrades to its caption + citation, never a
  broken note.

## Alternatives considered

- **One selection strategy for all presets** — either always-deterministic (loses
  contextual placement on capable models) or always-model-referenced (dilutes the 4B
  preset and risks empty/garbled placement). Rejected in favour of the preset-gated
  split above, which gives each model the strategy it can actually execute well.
- **True region-crop of vector figures** — render a page-region pixmap by bounding
  box, capturing figures drawn as vectors (not embedded rasters). Higher fidelity
  for some PDFs but needs layout analysis to find figure boxes. Deferred; embedded
  raster extraction covers the common lecture-PDF case.
- **Keep notes text-only, link out to the page instead** — cheapest, and the source
  viewer already opens a page. Rejected: it does not satisfy the ask (the figure in
  the note) and loses the at-a-glance value of the picture beside the prose.

## Consequences

- **Easier:** notes can show the source's own figures with no new hallucination
  surface — the picture is the user's own document, cited by page.
- **Constrained / honest downsides:**
  - Ingest does real image work and the library grows by the kept figures; the
    size/area filter bounds this but a figure-dense PDF still adds files.
  - Deterministic selection can attach a figure that is on-page but not the most
    *relevant* one; the review gate lets the human drop it, and model-referenced
    placement (above) is the path to relevance if this proves annoying.
  - This slice ships figures for **PDF walkthrough lessons only** — an intentional,
    recorded asymmetry mirroring how ADR-0011 shipped maths for notes only first.
