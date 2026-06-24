<div align="center">

# Arbora 🌳

**A local-first study space that turns your documents into grounded notes, flashcards, and quizzes — then schedules your review with FSRS.**

Tauri 2 · React · Python AI sidecar · SQLite + FAISS · Ollama (local) or BYO key

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

</div>

---

> **Status:** 🌱 Phase 2 — Skeleton. The app shell, database, and AI sidecar are being wired up.
> This README tracks the buildable state.

## What it does

Arbora ingests your PDFs, slides, and lecture audio, then uses a **local LLM** to generate
study material that is **grounded in your sources** — every flashcard, quiz item, and note
carries a citation back to a page or timestamp. Nothing leaves your machine unless you opt
into a Bring-Your-Own-Key cloud provider.

The three immutable rules:

1. **Grounded + cited** — AI generates only from your source content, with a citation per item.
2. **Review-before-trust** — no AI item enters your deck until you approve it.
3. **Local-first** — no data leaves the device except via opt-in, clearly-labelled BYO key / online.

## Architecture

```
React UI  ──invoke/event──►  Rust core (Tauri 2)  ──HTTP loopback──►  Python sidecar (AI)
                                   │                                        │
                                SQLite                              Ollama · FAISS · Whisper
```

- **React UI** — presentation, review/edit, dashboard. No AI logic.
- **Rust core** (`src-tauri/`) — orchestration: sidecar lifecycle, SQLite, Tauri commands.
- **Python sidecar** (`sidecar/`) — all AI: ingest, transcribe, RAG, LLM, FSRS, export.

## Repository layout

```
arbora/
├── src/          React frontend (Vite)
├── src-tauri/    Rust core — Tauri commands, SQLite, sidecar lifecycle
├── sidecar/      Python AI sidecar (FastAPI loopback)
├── shared/       Cross-layer contracts (JSON Schema → TS / Rust / Pydantic)
├── scripts/      setup, model download, build helpers
└── docs/         technical documentation
```

## Development setup

**Prerequisites:** Rust (see [`rust-toolchain.toml`](./rust-toolchain.toml)), Node (see [`.nvmrc`](./.nvmrc)),
Python 3.12+, and [Ollama](https://ollama.com).

```bash
# 1. Pull a local model (default daily-driver preset 🌿)
ollama pull qwen3:8b
ollama pull nomic-embed-text

# 2. Python sidecar
cd sidecar
python -m venv .venv
.venv/Scripts/activate        # Windows; use source .venv/bin/activate elsewhere
pip install -r requirements.lock

# 3. Frontend + Tauri (from repo root)
npm install
npm run tauri dev             # Tauri spawns the sidecar automatically
```

## License

[MIT](./LICENSE) — free, open-source, install-once.
