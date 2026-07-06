# ADR-0010: Broaden positioning to a comprehensive study platform for all students

- **Status:** Accepted
- **Date:** 2026-07-06

## Context

Arbora's early framing led with ADHD support: the README's status line headlined
"ADHD focus mode," and the founding pillar was "design for real brains" (see the
`a11y-adhd` skill and [ADR-0007](./0007-duolingo-minus-pressure.md)). In practice the
feature set — grounded notes/flashcards/quizzes, FSRS review, semester planning,
multi-subject Q&A, knowledge maps, interleaving — has grown into a general-purpose
study platform, and the calm/non-punishing design work behind it benefits any
student, not only ADHD ones. Leading the pitch with a single accessibility use case
undersold the product to the market it actually fits: students broadly, especially
university students (the onboarding flow already asks for year of study, field of
study, and term dates).

## Decision

We reposition Arbora as a comprehensive, all-in-one study assistant for students,
with particular focus on university students.

- Product-facing copy (README, `CLAUDE.md`'s "what Arbora is," future onboarding/
  marketing text) leads with "comprehensive study assistant for students, especially
  university students," not ADHD.
- The calm, non-punishing, low-overwhelm design philosophy (ADR-0007, `a11y-adhd`
  skill) is unaffected — it stays in place as an accessibility principle that
  benefits every user. Unlike the three immutable AI-safety laws (ADR-0002), this
  UX philosophy is **not** declared immutable by this ADR: it may be revisited later
  as the audience broadens, but no specific mechanic changes are made here.
- Internal engineering references to `a11y-adhd` (skill name, code comments
  explaining why a design choice is calm/non-punitive) are unaffected. This is a
  positioning change, not an engineering change.

## Alternatives considered

- **Keep ADHD as the headline audience, broaden only in secondary copy** — rejected:
  undersells the product's actual comprehensive feature set to the larger
  university-student market.
- **Strip out the ADHD-friendly design work entirely** — rejected: the calm,
  non-punishing philosophy is good design for everyone; there is no product reason
  to remove it, only the marketing frame changes.

## Consequences

- README and future onboarding/marketing copy should be audited against this
  framing; copy that headlines "ADHD" as the primary audience gets reworded to name
  it as one of several accessibility features, not the pitch.
- ADR-0007 and the `a11y-adhd` skill remain authoritative for *how* the UI behaves;
  this ADR only changes *who* the product is pitched to.
- Because the UX philosophy is explicitly left open to revision, a future ADR may
  relax specific non-punishing mechanics (e.g., streaks, deadline urgency) if that
  is found to serve the broader audience better — that decision is deferred, not
  made here.
