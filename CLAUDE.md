# CLAUDE.md — operating guide for Arbora

Read this first. It's how an agent works in this repo like a senior engineer would:
match the lifecycle phase, reach for the right skill, respect the laws, verify before
trusting. Keep it short and current — if it drifts from reality, fix it.

> **What Arbora is:** a local-first desktop study app. It turns a user's own
> documents and lectures into **grounded, cited** notes / flashcards / quizzes, then
> schedules review with FSRS. Tauri 2 · React · Python AI sidecar · SQLite + FAISS ·
> Ollama (local) or BYO key.

## The three immutable laws (never violate)

These are enforced in code and recorded in [ADR-0002](./docs/adr/0002-immutable-ai-laws.md).
A change that breaks one is a **bug**, not a trade-off.

1. **Grounded + cited** — AI generates only from the user's retrieved sources; every
   item carries a citation to a page/timestamp. Untraceable item → rejected.
2. **Review-before-trust** — no AI item is trusted until a human approves it in the
   review gate. Generated output is staged, never silently promoted.
3. **Local-first** — the core never sends data off-device. Online / BYO-key code is
   isolated behind an explicit opt-in flag and never imported by the core.

## Architecture in one breath

Three processes; see [docs/architecture.md](./docs/architecture.md) for the full map.

```
React UI (src/) ──invoke/event──► Rust core (src-tauri/) ──HTTP 127.0.0.1──► Python sidecar (sidecar/)
  presentation                     orchestration · SQLite · sidecar mgmt        all AI: RAG · LLM · Whisper · FSRS
```

| Path | Layer | Owns | Touch it with |
| ---- | ----- | ---- | ------------- |
| `src/` | React UI | presentation, review/edit, dashboard — **no AI logic** | `impeccable`, `minimalist-ui`, `a11y-adhd`, `frontend-ui-engineering` |
| `src/lib/ipc.ts` | UI↔core seam | typed wrappers over `invoke`/events — the UI's only door to the core | keep in sync with `commands.rs` |
| `src-tauri/` | Rust core | SQLite, sidecar lifecycle, IPC commands; the trusted/disk/network boundary | `tauri-sidecar` |
| `sidecar/` | Python AI | ingest, transcribe, RAG, LLM, FSRS, export | `rag-sidecar`, `llm-grounding`, `fsrs-srs` |
| `shared/` | contracts | cross-layer data shapes (→ TS / Rust / Pydantic), source of truth | `api-and-interface-design` |
| `docs/adr/` | decisions | why the code is the way it is | `documentation-and-adrs` |

## Run & verify

```bash
# Frontend (fast inner loop)
npm run lint            # tsc --noEmit
npm run build           # tsc && vite build
npm run tauri dev       # full app; Tauri spawns the sidecar automatically

# Sidecar  (cd sidecar)
ruff check . && pytest -q

# Rust core  (cd src-tauri; needs npm run build first — generate_context! reads dist/)
cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo build --locked
```

**Definition of done for a change:** the relevant layer's checks above pass, and if
the change crosses a process boundary, both sides (e.g. `commands.rs` + `ipc.ts`)
move together. CI runs all three layers on Windows/macOS/Linux — match it locally.

## How to work here (the senior-dev loop)

A global skill library (`~/.claude/skills/`, mapped in its `README.md`) covers the
full lifecycle. **Match the phase, then the skill** — don't jump to code on a vague
ask. Pick one skill per axis; don't double up.

| Phase | Reach for |
| ----- | --------- |
| **Define** (vague ask) | `interview-me` / `spec-driven-development` — sharpen intent *before* coding |
| **Plan** | `planning-and-task-breakdown` — ordered, verifiable tasks |
| **Design** | `codebase-design`, `api-and-interface-design`, `domain-modeling` |
| **Build** | `incremental-implementation` (>1 file), `test-driven-development`, `source-driven-development` |
| **Verify** | `debugging-and-error-recovery` / `diagnosing-bugs`; `doubt-driven-development` when stakes are high |
| **Review** | `code-review-and-quality`, `code-simplification`, **`security-and-hardening`** (any untrusted input / network / storage) |
| **Ship** | `git-workflow-and-versioning`, `ci-cd-and-automation`, `cross-platform-packaging`, `shipping-and-launch` |

**Project-specific skills** (auto-fire by description; invoke explicitly with `/name`):

- `tauri-sidecar` — editing `src-tauri/` commands, the sidecar module, or `server.py`;
  process lifecycle, IPC, no zombies / stuck ports.
- `rag-sidecar` — `sidecar/arbora_ai/{ingest,transcribe,rag}/`; keep retrieval
  subject-scoped and every chunk traceable to its source.
- `llm-grounding` — **any** AI generation or the LLM/structured-output/citation layers;
  defends laws #1 and #2.
- `fsrs-srs` — scheduling, `card_schedule`, the review gate, `.apkg`/AnkiConnect export.
  Use the FSRS library; never hand-roll a scheduler.
- `a11y-adhd` — any Arbora UI: high contrast, TTS, adjustable text, reduced motion,
  focus mode, calm non-punishing gamification (the tree never dies).
- `impeccable` / `minimalist-ui` — UI design, critique, polish; warm editorial,
  monochrome, no gradients/heavy shadows.
- `cross-platform-packaging` — `.github/workflows/`, `scripts/`, Tauri bundling,
  model downloads, signing, releases (Phase 5).

## Working agreement

- **Surgical changes.** Touch only what the task needs; match surrounding style; don't
  refactor what isn't broken. Every changed line should trace to the request.
- **Simplicity first.** Minimum code that solves it — no speculative abstraction or
  flexibility nobody asked for. If a senior would call it overcomplicated, simplify.
- **Verify before trust.** Reproduce a bug with a test before fixing; run the checks
  above before claiming done. Report failures honestly with the output.
- **Leave a trail.** A decision someone will later question → write an
  [ADR](./docs/adr/). Don't quietly undo a recorded decision; supersede it.
- **Structured output only.** Never parse free-text from an LLM — constrain with a
  schema, validate, retry, then error.
- **Test on weak hardware.** AI features must work on the low preset (Qwen3 4B /
  Whisper base), not just a fast machine.

## More

- Conventions & PR checklist — [CONTRIBUTING.md](./CONTRIBUTING.md)
- Architecture — [docs/architecture.md](./docs/architecture.md) · Decisions — [docs/adr/](./docs/adr/)
- Skill map & overlap guidance — `~/.claude/skills/README.md`
