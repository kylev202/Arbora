# Architecture Decision Records

An ADR captures **one decision** that shapes the codebase, the rejected
alternatives, and why — so a future contributor (or agent) inherits the reasoning
instead of re-deriving it or quietly undoing it.

## When to write one

Add an ADR when a change would make someone later ask *"why is it done this way?"*:
a structural choice, a hard constraint, a library you'll be stuck with, a boundary
between layers. Routine work does not need one.

## How

1. Copy [`template.md`](./template.md) to `NNNN-short-title.md` (next number, zero-padded).
2. Fill it in. Keep it short — context, the decision, the consequences.
3. A new decision that overturns an old one gets its **own** ADR and flips the old
   one's status to `Superseded by ADR-NNNN`. ADRs are append-only history; don't
   rewrite a decided one.

## Index

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](./0001-three-layer-architecture.md) | Three-process architecture (React · Rust · Python) | Accepted |
| [0002](./0002-immutable-ai-laws.md) | Three immutable AI-safety laws | Accepted |
| [0003](./0003-a11y-tuned-design-tokens.md) | Design tokens tuned for WCAG AA | Accepted |
| [0004](./0004-grounding-by-anchored-citation.md) | Grounding by anchored citation + verbatim excerpt | Accepted |
| [0005](./0005-tree-from-card-schedule.md) | Dashboard tree derives mastery from card_schedule | Accepted |
| [0006](./0006-semester-planning-and-priority.md) | Semester planning extends the subject; priority is computed | Accepted |
| [0007](./0007-disable-webview-drag-drop.md) | Disable WebView2 drag-drop so the file picker can't crash | Accepted |
| [0008](./0008-three-page-subject-view.md) | Three-page subject view; in-app flashcards replace Anki export; ephemeral cited tests | Accepted |
| [0009](./0009-week-walkthrough-journey.md) | Guided week journey — persisted overview + lesson notes, inline review, mixed practice | Accepted |
| [0010](./0010-broaden-audience-comprehensive-study-platform.md) | Broaden positioning to a comprehensive study platform for all students | Accepted |
