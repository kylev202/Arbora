# ADR-0007 — Borrow Duolingo's path, ban its pressure

Date: 2026-07-03 · Status: accepted

## Context

The v2.0 redesign wants studying to feel "engaging like Duolingo": a visible
path of small stages, immediate checks, satisfying daily progress. Duolingo's
engagement, however, is partly built on pressure mechanics — hearts/lives,
streak breakage, red overdue states, countdowns, guilt copy ("you're falling
behind"). Arbora's accessibility NFR (a11y-adhd) explicitly forbids
punishment-shaped motivation: the tree never dies, rest is part of learning,
and "Again" is grey, never red.

## Decision

We borrow exactly one idea from Duolingo — **complete small stages to complete
the week's content** — and ban the rest.

Borrowed (kept):
- A learning path of small, clearly ordered stages (one per outline week),
  with a single highlighted "next step".
- An immediate check after each stage (active recall via the existing
  study/quiz session, filtered to that stage's material).
- A today progress bar that fills 0→100% as todos/stages complete, with a
  light celebration at 100% (≤600ms, respects reduced motion, can be turned
  off).

Banned (never implement):
- Hearts/lives or any resource lost by answering wrong. A wrong answer only
  requeues the card (FSRS "Again", grey).
- Streak counters, streak breakage, or "N days since you studied".
- Red overdue states, countdown timers as pressure, or copy that blames
  ("late", "behind", "you missed…"). Deadlines render in earth gold.
- Hard-locked or expiring stages. Future stages are muted but reachable;
  finished stages never "close" — at most a neutral "worth a refresh" note.
- Prompts that push "one more lesson" after the user chose to stop.

Gamification tracks **real learning outcomes** (FSRS mastery growing the
tree), never time-in-app.

## Consequences

- The path UI derives stage state from card mastery (done/current/upcoming),
  not from schedules or dates, so nothing can become "overdue".
- Copy in the path, scheduler proposals and pet follows the neutral tone
  (see the planner's pre-built reasons).
- Reviewers should treat any PR that introduces a banned mechanic as a bug
  (same footing as the three immutable laws in ADR-0002).
