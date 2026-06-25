# ADR-0004: Grounding by per-chunk generation + anchored citation + verbatim-excerpt verification

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

Law #1 (grounded) and law #3 (per-item citation) must be *enforced*, not hoped
for. Small local models (Qwen3 4B/8B) hallucinate: they invent facts, and — more
subtly — they invent *citations*, emitting a plausible page number or a paraphrased
"excerpt" that never appears in the source. A wrong-but-cited card is worse than no
card. The Spike needs a mechanism that makes an untraceable item impossible to keep.

## Decision

We will generate **one item per chunk**, and treat the citation as **two parts
with different trust**:

- **source_id + location are authoritative** — we know which chunk we fed the
  model, so the pipeline *overwrites* whatever the model returned with the chunk's
  real source_id and page/timestamp (`anchor_citation`). The model cannot misfile
  a citation.
- **The excerpt is verified, not trusted** — the model's excerpt is kept only if
  it is a **verbatim substring** of that chunk (whitespace/case-normalised). If it
  is not, the item is **dropped** — not retried, not "fixed".

Structure failures (invalid JSON / schema) are retried up to 3× with a small
temperature bump; grounding failures are dropped immediately. A dropped item never
fails the batch — it is counted in a quality report (`% accepted`).

## Alternatives considered

- **RAG retrieval then free generation.** Rejected for the Spike: retrieval adds a
  failure mode (wrong chunk retrieved) and makes "which source does this item cite"
  ambiguous. Per-chunk generation makes grounding checkable by construction. (RAG
  still has its place for cross-subject Q&A in a later phase.)
- **Trust the model's full source_ref.** Rejected: models fabricate page numbers
  and excerpts; this is exactly the hallucination law #1 exists to stop.
- **Repair a non-verbatim excerpt (e.g. fuzzy-match to nearest sentence).** Rejected
  for now: it risks "grounding theatre" — attaching a real quote to an item the
  model may have derived from nothing. Dropping is honest; the acceptance rate then
  *measures* model grounding quality (a Spike deliverable).

## Consequences

- Every kept item is provably traceable: its citation points to the real chunk and
  its quoted excerpt physically exists there. Law #1/#3 are mechanical, not prompt-
  dependent.
- Acceptance rate becomes a real quality signal per model/preset (e.g. qwen3:8b on
  clean text: cards ~100%, quiz ~67%). Weaker models / messier PDFs will drop more —
  visible, not hidden.
- Cost: we discard some genuinely-correct items whose excerpt was paraphrased. For a
  study tool that is the right trade (a missing card beats a wrong one). Verbatim
  matching is also sensitive to parser whitespace, mitigated by normalisation.
- `reviewed` stays `false` regardless — this gate is about *traceability*; the human
  review gate (law #2) is still required before anything is trusted.
