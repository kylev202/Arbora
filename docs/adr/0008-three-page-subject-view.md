# ADR-0008: Three-page subject view; in-app flashcards replace Anki export; ephemeral cited practice tests

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

A subject's workspace had grown to a nine-item sidebar (Timeline, Sources, Content,
Study, Plan, Dashboard, Ask, Map, Diagrams). Users reported not knowing where to
go — too many peer destinations, several of them one-widget screens. The redesign
brief asked for exactly three pages, a horizontal nav, and three new capabilities:
varied practice tests (short answer, multiple choice, connect boxes, rearrange,
Feynman) with a per-test style picker, a pre-week knowledge check from week 2 on,
and 1–2 "rewind" review sessions lined up after each study session. It also asked
to drop the Anki `.apkg` export in favour of Arbora's own flashcard experience.

## Decision

**Three pages, horizontal nav** (`SubjectNav` under the top bar, replacing the
sidebar): **Overview** (subject management, sources + per-week assignment,
this-week/last-week/whole-unit progress, weekly todos, one primary "Start
studying" CTA), **Plan** (sub-tabs Plan · Deadlines · Timeline), **Study**
(this week's session with per-concept milestones + self-paced weeks, each with
four materials: Flashcards, Test, Diagram, Ask AI). Sessions (study, test,
review gate, knowledge map) are sub-flows reached by buttons, not nav items.
Old paths redirect.

**Anki export is removed end-to-end** (UI button, `export_apkg` command, sidecar
`/export`, genanki dependency). The in-app FSRS loop *is* the flashcard
mechanism; keeping a second, unscheduled copy of the deck outside the
review-gate/citation model added a maintenance surface without serving the
core loop. This supersedes the export affordance shipped in Phase 4 slice 4d.
(An export may return later as an explicit interop feature; it would be a new
decision.)

**Practice tests are ephemeral and cited, not review-gated.** `/test/generate`
reuses the grounded generation contract (flat gen-schema → validate → verbatim
excerpt check → authoritative citation from the chunk, ADR-0004) over
week-scoped chunks, and `/test/grade` grades free-text answers only against the
item's own grounded expected answer. Items are shown once and never persisted —
the same posture as `/chat` and `/diagram` (law #2 gates what enters the
trusted store, not one-shot conversational/practice output). Locally-gradable
kinds (multiple choice, matching, ordering) never touch the LLM to grade.

**Rewinds stay accept-gated.** The session recap proposes up to two rewind
sessions built from the session cards' real FSRS dues (rule-based, no LLM) and
persists them only through the existing `acceptSchedule` path — "auto-arranged"
in substance, but nothing lands on the calendar without one click of consent,
consistent with every other AI proposal.

## Consequences

- One clear place for everything; the nav answers "where am I, what's next"
  instead of offering nine peers. Deep links to old paths keep working.
- `assess/` (sidecar) and `assess.rs` (core) join the generation family; new
  test kinds extend `TEST_KINDS` + one gen-schema + one prompt + one runner.
- Content browsing folded into Study (flashcards/notes per week); the separate
  Content, Dashboard, Timeline, Plan, Ask, Diagrams screens were deleted.
- Free-text grading is LLM feedback and is labelled as such in the UI; verdicts
  are calm (correct / partly there / to revisit) with no red anywhere.
