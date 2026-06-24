# `src/features/` — feature slices

Each subfolder is one user-facing capability and owns its UI, local state, and the
`lib/ipc` calls it needs. Features do **not** import each other; shared pieces move
up to [`src/components/`](../components/) (presentational) or [`src/lib/`](../lib/)
(non-visual logic, IPC).

Planned slices (added as each phase lands — see [docs/architecture.md](../../docs/architecture.md)):

| Slice        | Responsibility                                              |
| ------------ | ----------------------------------------------------------- |
| `library/`   | Subjects & sources — import PDFs/slides/audio, browse them. |
| `ingest/`    | Ingest + transcribe progress, source preview.               |
| `review/`    | The review-before-trust gate: approve/edit AI items.        |
| `study/`     | FSRS review sessions (the daily driver).                    |
| `dashboard/` | Progress, the calm "tree", upcoming reviews.                |

> Reminder: the UI carries **no AI logic**. It calls the Rust core via
> [`src/lib/ipc.ts`](../lib/ipc.ts); all AI lives in the Python sidecar.
