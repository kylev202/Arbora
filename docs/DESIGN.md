# Design — "Aurora Canopy" (UI v3)

Generated from the live code (`src/styles/tokens.css`, `src/styles/global.css`,
`src/components/`) on 2026-07-16. Companion to [PRODUCT.md](./PRODUCT.md).
Register: **product** — glassmorphism grounded in a forest identity: frosted panes
floating over a slow-drifting aurora (light through a canopy).

## Theme

- Attribute-driven on `<html>`: `data-theme="light|dark"`, `data-contrast="normal|high"`,
  `data-reduced-motion="true|false"`. Base font size via `--font-base` (14/16/18/20px
  from Settings; everything scales in rem).
- **Light "Aurora Day"**: pale sage `#edf3ee` under green/gold/blue aurora radials;
  white glass panes (`rgba(255,255,255,.64/.84/.4)`).
- **Dark "Aurora Night"**: deep forest `#0e130f`; dark glass (`rgba(24,33,27,.64)`).
- **High contrast**: glass turns opaque (`--color-surface-solid`), blur off, aurora
  transparent — the whole material system collapses to solid AA surfaces.

## Color roles (light values)

- Primary action / focus ring: emerald `#2f7d54` (hover `#276b47`)
- Mastery / progress fills: `#55b378` (as text: `#2e7d4d`)
- "Learning" gold: `#d9a520` (as text: warning `#7d5e0a`)
- Info blue `#3f6b95` · Citation blue-grey chip (`--color-citation-*`)
- Danger earth-red `#b5524a` — **destructive actions only, never learning states**
- Tree: bark `#6f5138`, fruit terracotta `#c46a4f`
- Hard rules: no red/orange for anything learning-related (overdue = muted or gold);
  every text/surface pair targets WCAG AA against the *effective* backdrop
  (glass over aurora).

## Typography (3 families + mono)

- Body/UI: **Inter** (+ Be Vietnam Pro fallback for Vietnamese)
- Structural voice (h1/h2, stats, nav, buttons): **Space Grotesk**
- Emotional voice (greeting, subject names, recap; opt-in via `.display`): **Fraunces**
- Mono: JetBrains Mono. Scale: 0.8 → 0.9 → 1 → 1.25 → 1.6 → 2.1 → 2.8 rem;
  body line-height 1.6 (roomy on purpose). Tiny-caps labels via `.eyebrow`.

## Material — glass utilities (global.css)

`.glass` / `.glass-strong` (modals, bars) / `.glass-soft` (nested panes) +
`.glass-hover` (lift −2px on hover, settle on press). Recipes read
`--glass-bg*`, `--glass-blur` (20px + saturate 160%), `--glass-border`,
`--glass-highlight`. Components refine in their CSS modules.

## Motion

- Tokens: fast 140ms · base 220ms · slow 380ms (entrances) · grow 400ms (progress)
  · tree 600ms (**upper bound for any motion**).
- Eases: `--ease-out` (exp), `--ease-growth` (sprouting — progress/paths),
  `--ease-spring` (whisper of overshoot, never bouncy). No bounce, no confetti.
- Global keyframes: `rise`, `pop`, `fade`, `shimmer` (skeletons), `float-y`,
  aurora drifts. Utilities: `.rise`, `.pop`, `.stagger` (40ms steps, capped at 12).
- Transform/opacity only; progress is expressed as growth (fills grow, never drain).
- Reduced motion killed twice: OS `prefers-reduced-motion` + `data-reduced-motion`
  (both force 0.01ms durations, so `both` fill-modes resolve instantly).

## Layout & depth

- Content max 780px (`.page`), sidebar 220px, modals 520/440px.
- Radii 8/12/18/24px. Shadows sm/md/lg + `--shadow-glow` (primary-tinted hover glow).
- Semantic z-scale only: nav 100 · bubble 899 · pet 900 · banner 950 · modal 1000
  (`--z-*` tokens). QuickNote island (55) deliberately sits under everything floating.

## Component vocabulary (src/components/)

One shared set — never re-style per screen: `Button` (primary/secondary/ghost/danger,
danger = confirm-first red, default `type="button"`), `IconButton`, `Input`,
`Textarea`, `Select`, `DatePicker`, `Checkbox`, `RadioGroup`, `Tabs`, `Modal`
(focus trap, Esc, focus restore, `useId` title), `Tag`, `Kbd`, `StatTile`,
`ProgressBar`, `EmptyState` (sprout motif — empty means "not grown yet"),
`CitationChip` (always visible on AI content), `Disclaimer`, `Tree`/`ForestTree`,
motifs (`Sprout`, `SproutLoader`, `Leaf`, `GrowthRings` — currentColor, aria-hidden).

- Loading = shimmering skeleton blocks (`animation: shimmer 1.6s`), not spinners.
- Every interactive control: hover lift/tint, `:active` scale ≈0.97, global
  `:focus-visible` ring (never removed), disabled at 0.5 opacity.
- Buttons ≥40px touch target; labels are verb+object.

## Voice & UX rules (see PRODUCT.md principles)

Calm, one primary action per screen; empty states teach; nothing punishes
(the tree never dies); citations and "AI can be wrong" wherever AI content
appears; keyboard-complete flows with visible `Kbd` hints.
