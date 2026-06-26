# ADR-0005: Dashboard tree derives mastery from card_schedule, not the concepts table

- **Status:** Accepted
- **Date:** 2026-06-26

## Context

The data model (`0001_initial.sql`) ships a `concepts` table with a `mastery_state`
column and a `concept_cards` join, clearly intended to drive the dashboard tree
(S-08): green leaves = mastered concepts, gold = learning. But nothing in the
pipeline populates it — the generate stage produces notes, cards, and quiz items,
never concepts, and there is no concept-extraction step. Wiring the dashboard
(Slice 4) against `concepts` would make every subject's tree render permanently
empty, which is worse than wrong: the tree is Arbora's core "achievement, only
grows" motivator and an empty tree reads as failure.

## Decision

We will derive the tree from **`card_schedule` state** for a subject's reviewed
cards: a card in `review` state counts as a **mastered** (green) leaf;
`learning`/`relearning` count as **learning** (gold); `concepts_total` is the count
of reviewed cards; `mastery_pct = mastered / total` (0 when there are no cards).
The `concepts`/`concept_cards` tables are left in place but unused for now.

## Alternatives considered

- **Drive the tree from the `concepts` table as designed.** Rejected: nothing
  populates it, so the tree is always empty. Honest only in the sense that it
  reflects "no concept model yet" — but it silently breaks the one screen meant to
  motivate, with no signal that it's a stub.
- **Add a concept-extraction step to the generate pipeline now.** Rejected as scope
  creep for Slice 4 (backend wiring): concept extraction is its own grounded-AI
  feature with its own review/citation questions. A card is already the unit the
  FSRS scheduler tracks, so card mastery is a real, available signal today.

## Consequences

- The tree reflects genuine spaced-repetition progress immediately, on real data,
  with no new pipeline work. It only grows as cards reach `review` state, matching
  the "tree never shrinks as punishment" philosophy (mastered cards don't regress
  to non-mastered in normal FSRS flow; a lapse moves `review`→`relearning`, i.e.
  green→gold, a softening rather than a reset to bare).
- "Concept" in the dashboard UI currently means "card". If/when a real concept model
  lands, `fetch_tree` is the single place to swap the source; this ADR is then
  superseded. The `concepts` tables remain available for that work.
- A subject with many cards but few sources will show a denser tree than a
  concept-level view would — acceptable for now, and arguably more motivating.
