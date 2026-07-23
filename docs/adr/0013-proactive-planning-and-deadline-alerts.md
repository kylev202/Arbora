# ADR-0013 — Proactive planning: priority-weighted scheduling and calm deadline alerts

Date: 2026-07-23 · Status: accepted

## Context

The week planner (`sidecar/arbora_ai/planner/engine.py`, driven by
`commands/scheduler.rs`) is correct but **passive and priority-blind**:

- It only runs when the user clicks "Plan my week", and it treats every looming
  deadline the same. `deadlines.type` (`exam` / `assignment` / `other`) is
  gathered end-to-end — the DB has it, `scheduler.rs` sends it, `DeadlineIn.type`
  receives it — but `urgency()` never reads it, so an exam three days out competes
  for a scarce study slot on equal footing with a minor assignment.
- Nothing tells the user a deadline is approaching unless they open the subject's
  Plan tab. The app never reaches *out*.

The user asked for the planner to be "more active" and to "alert when deadlines
are coming and plan based on priority", and chose **OS notifications** in addition
to in-app surfacing. That last choice touches [ADR-0007](./0007-duolingo-minus-pressure.md),
which bans pressure mechanics — countdown timers, red overdue states, guilt copy,
and "prompts that push after the user chose to stop". A push notification is, by
construction, the app reaching out uninvited, so it needs an explicit position
rather than a silent slide past ADR-0007.

## Decision

Three things, all inside the calm philosophy — the planner's output stays a
*proposal* the user accepts (law #2), everything is local (law #3).

### 1. Priority-weighted scheduling (built now)

`urgency()` weights a subject's looming deadline by **type**: an exam pulls harder
than an assignment, which pulls harder than "other". This changes only the
**order** subjects claim scarce slots — never the target *count* (still 2 for
`high_gpa`, 1 for `pass`, +1 when any deadline looms). When slots are plentiful
everyone still gets covered; when they're scarce, the exam wins the slot.

This is deliberately separate from the *week* priority queue of
[ADR-0006](./0006-semester-planning-and-priority.md), which stays narrow
(proximity + unstudied volume, no type, no grade weight). That queue answers
"which week is worth studying"; the scheduler answers "when two subjects want the
same hour, who gets it" — type belongs in the second question, not the first.

### 2. Calm in-app deadline alert (built now)

A dismissible, glanceable banner (same floating-strip language as `SidecarBanner`)
surfaces deadlines inside a **near horizon** (default 7 days), newest-relevant
first, with a "Plan" action that jumps to that subject's Plan tab. It is fed by a
new pure-read command, `upcoming_deadlines(within_days)` — cross-subject, future
only, ordered by due date. It writes nothing.

Constraints that keep it calm (a reviewer treats a violation as a bug, per
ADR-0007):

- **Gold, never red.** Earth-gold accent, the house "calm warning" treatment.
- **Neutral fact, not a countdown.** "Biology exam · in 3 days" — a plain
  statement, never "only 3 days left!", never "you're behind".
- **Dismissible, session-scoped.** Dismiss hides it for the session. It may return
  on the next launch *only if the deadline is still ahead* — a real, now-closer
  fact, not a re-nag within the same sitting.
- **Never during focus mode.** Focus mode strips chrome by design; the alert
  respects that and does not appear.

### 3. OS notifications (deferred to a later slice, permitted here)

We **will** allow a native OS notification for an approaching deadline — this is
the bounded exception to ADR-0007's "no push". It is permitted *only* under all of:

- **Opt-in, default off.** A Settings toggle the user turns on deliberately.
- **One-shot per deadline.** At most one notification per deadline (e.g. the
  morning it enters the horizon) — never a recurring drip, never escalating.
- **No countdown, no red, no guilt.** Same neutral copy as the in-app alert.
- **Local only.** Scheduled and fired on-device; no push service (law #3).

It is not built in this slice because it needs the `tauri-plugin-notification`
dependency and OS permission handling (cross-platform packaging surface, Phase 5).
This ADR records the decision so that slice implements a settled position rather
than re-opening it.

## Alternatives considered

- **Fold type into the ADR-0006 week priority queue instead.** Rejected: that
  queue is intentionally narrow and shared by the Timeline/Plan UI; widening it
  would change what "focus next" means app-wide for a scheduler-only need. The two
  rankings answer different questions.
- **Inflate the target session count for exams (+2 instead of +1).** Rejected:
  more forced sessions is exactly the pressure ADR-0007 bans. Ordering, not
  volume, is the calm lever. *(Amended by [ADR-0014](./0014-deadline-runup-backward-planning.md):
  a bounded `+2` in an exam's **final week only**, still dismissible proposals
  spread across days, is now permitted; the blanket run-up `+2` rejected here
  stays rejected.)*
- **A persistent, non-dismissible deadline bar.** Rejected: an alert you can't
  dismiss is a nag. Session-scoped dismissal keeps it glanceable and respectful.
- **Notifications on by default.** Rejected: an uninvited push the user didn't ask
  for is the sharpest form of the pressure ADR-0007 forbids. Opt-in is the line.

## Consequences

- The scheduler's slot ordering now reflects exam-vs-assignment; the target-count
  math and the coverage/keep-filling loop from the prior slice are untouched.
- A new app-wide surface exists but only appears when a deadline is genuinely near
  and the user hasn't dismissed it — invisible on the happy path, like the sidecar
  banner.
- The OS-notification slice has a written contract to build against; a PR that
  adds a recurring, default-on, or countdown-styled notification is a bug.
