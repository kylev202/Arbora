# Product

## Register

product

## Users

University students (all students, not only ADHD — ADR-0010) studying from their own
documents and lectures: PDFs, slides, recordings. They arrive tired, distracted, or
procrastinating; starting is the hardest part. Everything runs on their own machine
(local-first, ADR-0002) — many use mid/low-spec laptops.

## Product Purpose

Arbora turns a student's own sources into grounded, cited notes, flashcards, and
quizzes, then schedules review with FSRS. Success is real retention (concepts reaching
target mastery), never minutes-in-app. Every AI item is traceable to a page/timestamp
and must pass a human review gate before it is trusted.

## Brand Personality

Calm · grounded · quietly alive. The visual world is "Aurora Canopy": light filtering
through a forest canopy — frosted glass over a slow aurora, greens and warm earth.
Warmth without noise; growth without pressure.

## Anti-references

- Duolingo-style pressure mechanics: streaks, hearts, red overdue counts, guilt nudges
  (ADR-0007 — the tree never dies).
- Engagement-theater gamification: points/badges for time spent rather than learning.
- Loud SaaS marketing aesthetics: neon gradients, confetti, hero-metric dashboards.
- Sterile flashcard utilitarianism (bare Anki-style tables with no warmth).

## Design Principles

1. **Calm over stimulation** — one primary action per screen, generous whitespace,
   at most one accent per view.
2. **Never punish** — no red for learning states; absence costs nothing; progress is
   additive only.
3. **Evidence visible** — citations are always present and clickable; "AI can be
   wrong" disclaimers appear wherever generated content does.
4. **Low activation energy** — one click to begin, short sessions, immediate feedback.
5. **Growth is earned** — the tree and all progress reflect FSRS mastery data, not
   engagement metrics.

## Accessibility & Inclusion

WCAG AA contrast against the *effective* backdrop (glass over aurora). Adjustable base
font (14/16/18/20px) that must not break layout. High-contrast mode turns glass opaque
and disables blur. Reduced motion honored twice: OS `prefers-reduced-motion` and an
in-app toggle. TTS for notes/cards. Full keyboard navigation with always-visible focus
rings. Focus mode strips the UI to the current task.
