# ADR-0001: Three-process architecture (React · Rust · Python)

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

Arbora is a local-first desktop study app. It needs three things that pull in
different directions:

- a responsive, accessible desktop **UI**;
- **trusted local-only orchestration** — own the SQLite database, manage processes,
  guarantee nothing leaves the device;
- a rich, fast-moving **AI/ML stack** — Whisper, embeddings, FAISS, an LLM client,
  FSRS — which in practice lives in the Python ecosystem.

No single runtime is strong at all three. Forcing AI into the UI or into Rust would
mean fighting the ecosystem; doing orchestration in Python would give up Tauri's
small, safe, signed desktop shell.

## Decision

We will split the app into three processes with clear responsibilities:

- **React UI (`src/`)** — presentation only, no AI logic. Talks to the core through
  one typed seam (`src/lib/ipc.ts`).
- **Rust core (`src-tauri/`, Tauri 2)** — orchestration: owns SQLite, manages the
  sidecar lifecycle, exposes the IPC commands. The only layer trusted with the disk
  and the network boundary.
- **Python sidecar (`sidecar/`)** — all AI, behind a `127.0.0.1` FastAPI server the
  core spawns and health-checks.

The core ↔ sidecar handshake (stdout port marker → `GET /health`) and zombie-free
teardown are part of this decision; see [architecture.md](../architecture.md).

## Alternatives considered

- **All-in-Tauri (Rust-only AI)** — the ML ecosystem in Rust is immature for
  Whisper/embeddings/LLM orchestration; rejected to avoid fighting tooling.
- **Electron + Python** — heavier runtime, larger bundles, weaker security story
  than Tauri; rejected.
- **Python desktop GUI (e.g. Qt)** — gives up web UI velocity and Tauri's signed,
  lightweight distribution; rejected.

## Consequences

- **Easier:** each layer uses its ecosystem's best tools; the AI stack can move fast
  without touching the trusted core; the network boundary is one auditable layer.
- **Harder / accepted cost:** a process boundary to manage (spawn, health, restart,
  shutdown — the `tauri-sidecar` skill exists for exactly this), cross-language data
  contracts to keep in sync (`shared/`), and a packaging story that must bundle a
  Python runtime (the `cross-platform-packaging` skill, Phase 5).
