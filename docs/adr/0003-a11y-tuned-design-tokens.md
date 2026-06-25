# ADR-0003: Design tokens are tuned for WCAG AA, even where that deviates from the design-system doc

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

The Phase-1 Design System fixed an exact palette (e.g. `--color-primary: #4A7C59`,
`--color-warning: #C9A227`). Building the Phase-3 UI, an automated WCAG audit of
every text/surface pair found several failures of the project's own
**A11y-from-MVP** requirement (NFR-A11Y, contrast ≥ AA):

- `primary` text on `primary-soft` (active sidebar/tab) — 4.19 (< 4.5).
- `warning` gold as text on light surfaces / tinted disclaimers — 3.26 (< 4.5).
- `accent` green used as text (e.g. the "Good" rating) — 2.97 (< 4.5).
- Interactive **control** borders (`--color-border` on inputs/checkboxes/radios/
  selects/secondary buttons) — ~1.4:1, below WCAG 1.4.11 non-text 3:1.

The UI plan already states the rule for this conflict: *"khi xung đột → Arbora +
a11y thắng"* (a11y wins). The design-system doc is guidance, not a contract.

## Decision

We will treat **WCAG AA as the binding constraint** and adjust the design tokens
to meet it, keeping the warm/calm character but deviating from the doc's literal
hex values where they fail. Specifically:

- `--color-primary` `#4A7C59 → #457155`; `--color-warning` `#C9A227 → #7D5E0A`.
- Add `--color-accent-text` (`#41803E`) for green **text**, distinct from
  `--color-accent` which remains for **fills** (tree leaves, progress).
- Add `--color-border-strong` (`#888475` light / `#7C776D` dark, ≥ 3:1 on every
  surface) for **interactive control** edges; keep the soft `--color-border` for
  decorative dividers and card edges.
- Add `--color-fruit` for the tree's decorative fruit so `--color-danger` is used
  **only** for destructive actions (and form-validation errors) — preserving the
  "no red for learning states" law as a greppable invariant.

Contrast is verified by a script; all text pairs are ≥ 4.5 and control borders
≥ 3 across light, dark, and high-contrast themes.

## Alternatives considered

- **Follow the doc's hex values exactly.** Rejected: ships known AA failures and
  violates NFR-A11Y; the doc itself defers to a11y on conflict.
- **Darken `--color-border` globally to 3:1.** Rejected: makes every card/divider
  heavy, fighting the minimalist/calm aesthetic. A separate token for controls
  keeps dividers soft while making interactive edges perceivable.
- **Use one green token for both fills and text.** Rejected: a green dark enough
  to be AA text looks muddy as leaf fill; splitting fill vs text keeps both right.

## Consequences

- The running UI is AA-clean; the audit is repeatable (`node` contrast script +
  `npm run ui:shots` smoke test).
- The Design System doc and the code now differ on a few hexes — this ADR is the
  record of why; update the doc to point here rather than "restoring" the values.
- Two extra tokens (`--color-accent-text`, `--color-border-strong`, `--color-fruit`)
  to maintain. Components must pick fill vs text / divider vs control deliberately.
