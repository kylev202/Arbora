# ADR-0006: Semester planning extends the subject; priority is computed, not stored

- **Status:** Accepted
- **Date:** 2026-06-26

## Context

A subject in Arbora has been a flat bucket — sources, generated content, study, a
`deadlines` list, and a grade book — with no sense of *when* in a term anything
happens. Real units run over numbered weeks: each week has its own topic and
materials, and assignments/exams fall on dates that should pull certain weeks
forward. Users want to drop in a unit outline (manually or by uploading a syllabus),
hang each week's materials off that week, see what an assignment draws on, and get a
signal for "study this before the nearest deadline."

This needs a place for semester structure in the data model, a rule for "priority,"
and — because two of the affordances are AI (parse a syllabus, write a study brief) —
a position on how they sit against the three immutable laws ([ADR-0002](./0002-immutable-ai-laws.md)).

## Decision

We will **extend the existing `subject`** with an optional outline rather than
introduce a separate `Semester`/`Unit` entity: `subjects` gains `term_start` +
`week_count`, and a `weeks` child table holds the per-week topic/summary. A subject
*is* the unit for a term.

- **Linkage by week.** Materials link to a week (`sources.week_id`, nullable,
  `ON DELETE SET NULL`); assignments link to the weeks they cover
  (`assignment_coverage`). Deleting a week unassigns rather than destroys.
- **Week dates are derived but stored.** `set_outline` computes each week's
  `start_date` as `term_start + (n-1)*7 days` (SQLite `date()`), but persists it per
  row so a single week can be nudged. Changing the term start or week count
  recomputes/reconciles, keeping any topics already written.
- **Priority is computed, never stored** — like the grade summary in
  `commands/plan.rs`. `get_priority_queue` (slice 3) ranks weeks from **deadline
  proximity + unstudied-material volume only** (a deliberate, user-chosen pair — not
  grade weight, not FSRS-due). It is a pure function over fetched rows, unit-tested,
  with **no red/punishment semantics** ([a11y-adhd](../../CLAUDE.md)).
- **AI affordances reuse existing patterns** (slices 4–5). Syllabus parsing is
  *structured extraction from the user's own document, confirmed before commit* — it
  produces editable weeks/deadlines, not study claims, so per-item citations aren't
  required, but nothing is written until the user accepts it (the review-before-trust
  spirit). The per-assignment study **brief** *is* generated study content, so it
  goes through the full grounded path: generated over the covered weeks' chunks,
  every cited line verbatim-checked (`generate/grounding.py`), authoritative
  source/location attached by the core ([ADR-0004](./0004-grounding-by-anchored-citation.md)),
  and staged `reviewed = 0` for the gate ([ADR-0002](./0002-immutable-ai-laws.md) law #2).

## Alternatives considered

- **A separate `Semester`/`Unit` entity grouping subjects.** Rejected: it duplicates
  what a subject already is (one course, one term) and forces every existing
  query/screen to learn a new parent. The semester is a *property* of the subject,
  not a container above it. If multi-term history is ever needed, a subject can be
  cloned — a smaller change than restructuring now.
- **Store a precomputed priority score per week.** Rejected: priority is a pure
  function of deadlines + study state, both of which change constantly; a stored score
  would be stale the moment a card is reviewed or a deadline added. Computing on read
  (as the grade summary already does) is simpler and always correct.
- **Treat the syllabus as a normal ingested source and RAG the structure out.**
  Rejected: a syllabus is small admin metadata, not study material — indexing it into
  the citable corpus would pollute retrieval. We parse it directly under a structured
  schema and let the user confirm, without adding it as a Source.

## Consequences

- Existing data is untouched: every new column/table is additive and nullable, so
  subjects without an outline behave exactly as before (the UI shows a "set up
  outline" empty state).
- The week becomes the spine the Timeline UI (slice 2) and priority panel (slice 3)
  render against, and the join point assignments analyse — one model serves all three.
- "Priority" is intentionally narrow (proximity + unstudied volume). It will *not*
  reflect grade weight or due cards; if that proves too blunt, the formula lives in
  one tested function and can grow there.
- Delivery is phased across five slices; slices 1–3 ship a complete manual planner
  with **no new AI**, so the feature is usable before the sidecar work lands. The
  `assignment_briefs`/`assignment_brief_refs` tables are created up front (this
  migration) but unused until slice 5.
