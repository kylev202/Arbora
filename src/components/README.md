# `src/components/` — shared UI primitives

Reusable, **presentational** components shared across more than one feature
(buttons, cards, dialogs, the status list, layout primitives). They take props and
render; they do not call [`src/lib/ipc.ts`](../lib/ipc.ts) or hold feature state.

If a component is used by only one feature, keep it inside that feature's folder
under [`src/features/`](../features/) until a second feature needs it — then promote
it here.

Accessibility and the calm/ADHD-friendly philosophy are not optional here; see the
`a11y-adhd` and `minimalist-ui` skills before building anything user-facing.
