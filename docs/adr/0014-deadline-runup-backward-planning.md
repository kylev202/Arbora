# ADR-0014 — Deadline run-up backward-planning and a bounded final-week exam volume bump

Date: 2026-07-23 · Status: accepted · Amends [ADR-0013](./0013-proactive-planning-and-deadline-alerts.md)

## Context

[ADR-0013](./0013-proactive-planning-and-deadline-alerts.md) made the scheduler
weight a looming deadline by **type** (exam > assignment > other), but only as
slot *ordering* — the extra-session count stayed a flat `+1` for any looming
deadline, and it deliberately **rejected** raising that to `+2` for exams:

> *Inflate the target session count for exams (+2 instead of +1). Rejected: more
> forced sessions is exactly the pressure ADR-0007 bans. Ordering, not volume, is
> the calm lever.*

Two things pushed us back to that line:

1. **The flat `+1` is not backward-planning.** The planner plans one week at a
   time, and today a deadline exerts the *same* pull every week from now until it
   is due — with **no horizon gate at all**
   ([engine.py](../../sidecar/arbora_ai/planner/engine.py), `soonest` was
   populated for *any* future deadline). So a deadline three months out still adds
   `+1` and marks the session "start early" this week. That is over-eager, not
   proactive: the run-up should *begin at a sensible lead time and intensify as the
   due date nears*, which a single-week planner expresses by deciding how much
   **this** week owes the deadline based on where this week sits in the run-up.
2. **The user asked for a genuinely stronger final-week push for exams.** Presented
   with the calm ordering-only option and this volume option (with the ADR-0013
   tension called out explicitly), they chose the volume bump. That is a product
   decision the user owns; our job is to make it as calm as the philosophy allows
   and to record *why* it no longer reads as the pressure ADR-0007 forbids.

## Decision

Two changes, both inside the planner engine only (deadlines and their `type`
already flow end-to-end; no Rust/IPC/UI change). Everything stays a **proposal**
the user accepts (law #2), local-only (law #3).

### 1. Type-scaled run-up (backward-planning)

A deadline shapes the week only once `now` is within its **run-up horizon**, scaled
by type — `exam` 21 days, `assignment` 14, `other` 7. Inside the run-up it adds its
extra session(s) and its ordering urgency ramps toward the due date (closer =
stronger); **outside** it, the subject follows normal cadence with no extra and no
"start early" copy. Re-planning each week therefore walks the run-up forward:
exams get a longer runway than assignments, and far-future deadlines stop cramming
today. This supersedes the un-gated `+1` and the flat 14-day urgency horizon of
ADR-0013 §1 (which stays correct in spirit — type still orders slots — but now
begins and ramps per type).

### 2. Bounded final-week exam volume bump (the amend)

In an **exam's** final stretch (≤ 7 days out) the run-up earns a **second** extra
session — target `+2` instead of `+1`. This is the point ADR-0013 rejected; it is
now permitted **only** under all of these, which are what keep it a supportive
offer rather than the pressure ADR-0007 bans:

- **Exams only, final week only, capped at +2.** Never assignments, never "other",
  never `+3`, never escalating week over week. One bounded step, once.
- **Still a dismissible proposal.** Like every planner output it is staged, not
  written; the user accepts or dismisses each card (law #2). Nothing is forced onto
  the calendar — the "forced sessions" ADR-0013 feared do not exist here.
- **Spread across days by the existing calm caps.** `≤ 1 session/subject/day` and
  `≤ 2 new sessions/day` are unchanged, so a `+2` lands on **two different days** —
  it is a wider run-up, not a same-sitting cram.
- **No countdown, no red, no guilt.** Same neutral copy as before ("… is due in N
  days — starting early helps"); a dismissed proposal simply does not return via
  the [dismissed-slots](../../src-tauri/migrations/0020_dismissed_slots.sql) signal.

The blanket run-up `+2` ADR-0013 rejected — two extra every week of the run-up —
**remains rejected**. What is permitted is narrower: one extra beyond the usual
extra, only in the last week, only for an exam.

## Alternatives considered

- **Keep ordering-only (ADR-0013 as written), just add the run-up gate.** The
  calmest option and fully within ADR-0013; rejected here only because the user
  deliberately chose a stronger final-week push after the trade-off was surfaced.
  The run-up gate itself is kept — it is the uncontested half.
- **Let the bump grow (+2 at 7 days, +3 at 3 days).** Rejected: escalation is the
  drip ADR-0007 bans. A single bounded step keeps it an offer, not a countdown.
- **Apply the bump to assignments too.** Rejected: exams are the case where a
  denser final week is genuinely warranted and expected; widening it dilutes the
  signal and edges back toward "more sessions for everything".

## Consequences

- A far-future deadline no longer inflates the current week; the "start early" copy
  appears only inside the run-up. Some existing planner tests move from a 4-day
  exam (now `+2`) to an assignment or a mid-run-up exam to keep asserting the `+1`
  path deliberately.
- The coverage / keep-filling loop math is unchanged in shape — `needed` now reads
  the per-subject extra (0/1/2) instead of a flat `+1`, and `remaining` follows.
- A PR that makes the bump recurring, default larger than `+2`, applicable beyond
  exams, or styled as a countdown is a bug against this ADR.
