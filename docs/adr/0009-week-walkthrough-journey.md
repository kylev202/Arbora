# ADR-0009: Guided week journey — persisted overview + lesson notes, inline review, mixed practice

- **Status:** Accepted
- **Date:** 2026-07-04

## Context

The Study page's "this week's session" (ADR-0008) opened straight into flashcards:
a flat list of concept milestones and an FSRS review. There was no reading path —
no overview of what the week is about, no walk through the material before recall.
Users asked to *learn* the week, not just be quizzed on it: read a summary, be led
lesson by lesson, and practise with varied question types rather than front/back
cards alone.

The existing pieces already cover most of this. The grounded generation pipeline
(ADR-0004) produces cited notes; the ephemeral practice-test engine (ADR-0008)
produces five question kinds over week-scoped chunks; FSRS owns recall. What was
missing is a *structure* that composes them into one guided flow, plus a place to
persist the reading material — and persisted AI content triggers law #2
(review-before-trust).

## Decision

We will add a **week walkthrough**: one grounded overview note plus 3–6 small
lesson notes per outline week, generated together and persisted, and a **journey**
screen that plays them as a guided session — overview → each lesson (read its note,
then ~3 varied practice questions) → a final recall round of the week's flashcards.

- **New generation kind, reusing the house pattern.** `sidecar/.../generate/walkthrough.py`
  synthesises the overview and each lesson from a spread/bucketed set of the week's
  chunks, attaching authoritative citations from the chunk each excerpt grounds in
  (ADR-0004). One `/walkthrough` job, same progress/poll shape as `/generate`.
  An overview that can't be grounded fails the job; an ungrounded lesson is skipped,
  never invented.
- **Persisted, one per week, review-gated inline.** `week_walkthroughs` +
  `walkthrough_lessons` store the notes `reviewed = 0`. The gate is satisfied in the
  flow: reading a note on first encounter shows an "AI draft — keep it" affordance
  whose confirm flips `reviewed = 1`. No detour to the review queue. Regenerating
  replaces the week's walkthrough (unique on `week_id`) and resets progress.
- **Practice reuses the test engine, scoped to the lesson.** Each lesson records the
  chunk keys it was built from (`walkthrough_lesson_chunks`); `generate_lesson_test`
  feeds exactly those chunks to `/test/generate` (`count_per_type = 1`). Items stay
  ephemeral and cited — never persisted, same posture as `/chat` and `/diagram`.
- **Recall stays FSRS.** The last step is the existing week flashcard session, so the
  tree grows from the journey; skipping it is always fine (ADR-0007 posture).
- **The journey is the primary "this week" path** and a per-week material tab; the old
  milestone list becomes the pre-journey preview.

## Alternatives considered

- **Notes-only walkthrough, one test at the end** — reading with a single terminal
  test. Rejected: interleaving a few questions per lesson gives retrieval practice
  while the lesson is fresh, and keeps each checkpoint short (ADHD posture).
- **Ephemeral notes (like tests), no persistence** — no review gate, simpler. Rejected:
  a reading path the user returns to across days must persist, and persisted AI claims
  must pass law #2. Inline approval keeps the gate without a separate queue trip.
- **Route lesson practice through the standard review deck** — rejected: journey
  questions are formative and varied (matching/ordering/Feynman), not scheduled deck
  cards; persisting them would duplicate the deck and muddy FSRS.
- **Whole-week questions, not lesson-scoped** — simpler chunk handling. Rejected:
  recording each lesson's chunk keys keeps its questions about *that* lesson, so the
  checkpoint tests what was just read.

## Consequences

- One coherent "learn this week" flow; the journey answers "what's this week about
  and what do I do next" instead of dropping the user into a card stack.
- The generation family gains a fourth member (`walkthrough` alongside content, brief,
  test); a new persisted+gated kind means new tables, a `walkthrough:*` event trio,
  and seven commands to keep in sync across `commands.rs` ↔ `ipc.ts`.
- Inline approval is a **second** review path beside the queue. It's still law #2
  (nothing trusted until a human keeps it), but reviewers now must know approval can
  happen in two places.
- More small LLM calls per week (overview + N lessons + N×~3 questions). Generation
  is chunk-bounded and runs on the low preset, but a big week is several jobs; the UI
  builds lesson questions in the background while the user reads to hide the latency.
- Regeneration is destructive by design (replace, not version). A user who rebuilds
  loses the previous walkthrough and its progress — acceptable for staged, cited,
  reproducible content, but not undoable.
