# Architecture

Arbora is three processes with one hard rule between them: **the UI never does AI,
the core never leaves the device, and the sidecar never trusts itself.**

```
┌──────────────┐  invoke / event   ┌──────────────────┐  HTTP (loopback)  ┌────────────────────┐
│  React UI    │ ◄───────────────► │  Rust core       │ ◄───────────────► │  Python sidecar    │
│  (src/)      │                   │  (src-tauri/)    │                   │  (sidecar/)        │
│              │                   │                  │                   │                    │
│ presentation │                   │  orchestration   │                   │  all AI work       │
│ review/edit  │                   │  SQLite          │                   │  Ollama · FAISS    │
│ dashboard    │                   │  sidecar mgmt    │                   │  Whisper · FSRS    │
└──────────────┘                   └──────────────────┘                   └────────────────────┘
        no AI logic                       no network*                     127.0.0.1 only, no UI
```

\* The core never sends data off-device. Opt-in BYO-key / online calls live behind an
explicit flag in isolated sidecar modules — see [ADR-0002](./adr/0002-immutable-ai-laws.md).

## The three layers

### React UI — `src/`
Presentation only: import flow, the review/edit gate, study sessions, dashboard. It
holds no AI logic and speaks to the core through exactly one seam,
[`src/lib/ipc.ts`](../src/lib/ipc.ts) — never `invoke("...")` with a raw command
name. Organized feature-first; see [`src/features/`](../src/features/).

### Rust core — `src-tauri/`
The orchestrator and the only layer the OS trusts with the disk:

- **SQLite** ([`db.rs`](../src-tauri/src/db.rs), [`migrations/`](../src-tauri/migrations/)) —
  user data, never committed, lives in the OS app-data dir.
- **Sidecar lifecycle** ([`sidecar.rs`](../src-tauri/src/sidecar.rs)) — spawn the
  Python process, discover its port, health-check, kill on exit (no zombies).
- **Tauri commands** ([`commands.rs`](../src-tauri/src/commands.rs)) — the IPC surface
  the UI calls; mirrored on the TS side by `src/lib/ipc.ts`.

### Python sidecar — `sidecar/`
Every byte of AI work, behind a FastAPI loopback server
([`arbora_ai/server.py`](../sidecar/arbora_ai/server.py)): ingest & OCR, Whisper
transcription, chunking + embeddings + FAISS retrieval (`rag/`), the LLM provider
abstraction (`llm/`, Ollama local ↔ BYO key), FSRS scheduling, and `.apkg` export.

## How the layers talk

**UI ↔ core — Tauri IPC.** Synchronous calls via `invoke`; the core pushes lifecycle
changes as events (e.g. `sidecar:status`). The typed contract is `src/lib/ipc.ts`
(TS) against `commands.rs` (Rust). Add a command in one, add its wrapper in the other.

**Core ↔ sidecar — HTTP on `127.0.0.1`.** Startup handshake:

1. Rust spawns `python -m arbora_ai.server`.
2. The sidecar binds a free loopback port and prints `ARBORA_SIDECAR_PORT=<port>` —
   the one stdout line Rust parses; everything else goes to stderr.
3. Rust polls `GET /health` until 200, then marks the sidecar ready.

Loopback only — the sidecar is never exposed beyond the machine. Details and the
lifecycle invariants live in the `tauri-sidecar` skill.

## Cross-layer contracts — `shared/`

Data shapes that cross a process boundary (AI output schemas, IPC payloads) are
defined once in [`shared/`](../shared/) as the source of truth and projected to TS,
Rust, and Pydantic — so a flashcard means the same thing in all three layers.

## Where AI safety is enforced

The three immutable laws ([ADR-0002](./adr/0002-immutable-ai-laws.md)) are not style
preferences; they are load-bearing:

- **Grounded + cited** — generation runs only over retrieved source chunks; every
  item carries a citation back to a page or timestamp. Enforced in the sidecar's
  `rag/` + `generate/` paths (`llm-grounding`, `rag-sidecar` skills).
- **Review-before-trust** — AI output is staged, not trusted, until a human approves
  it in the review gate. Enforced at the DB boundary in the core and the `review/`
  feature in the UI (`fsrs-srs` skill).
- **Local-first** — see the loopback + opt-in-network notes above.

## Related docs

- Decisions and their rationale — [Architecture Decision Records](./adr/)
- Conventions & PR checklist — [CONTRIBUTING](../CONTRIBUTING.md)
- Agent operating guide (skills wiring) — [CLAUDE.md](../CLAUDE.md)
