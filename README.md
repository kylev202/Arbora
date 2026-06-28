<div align="center">

# Arbora 🌳

**A local-first study space that turns your documents and lectures into grounded, cited notes, flashcards, and quizzes — then schedules your review with FSRS.**

Tauri 2 · React · Python AI sidecar · SQLite + FAISS · Ollama (local)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

</div>

---

> **Status:** 🌳 Phase 8 — Video ingestion. Full study loop wired end-to-end; multi-subject Q&A, knowledge map, interleaving, diagrams, ADHD focus mode, and video lecture support.

## What it does

Arbora ingests your PDFs, slides, and lecture recordings, then uses a **local LLM** to generate
study material that is **grounded in your sources** — every flashcard, quiz item, note, and
study brief carries a citation back to a page or timestamp. Nothing leaves your machine.

**Three immutable laws (enforced in code):**

1. **Grounded + cited** — AI generates only from your retrieved source content; every item cites a page or timestamp.
2. **Review-before-trust** — no AI item enters your deck until you approve it in the review gate.
3. **Local-first** — no data leaves the device.

**Features:**

- Ingest PDFs, slide decks (PPTX), audio files, and video lecture files (MP4, MKV, WebM, AVI, MOV)
- AI generates flashcards, multiple-choice quiz items, and outline notes — all grounded and cited
- Review gate: approve or edit every AI item before it enters your deck
- FSRS spaced-repetition study loop with a mastery dashboard ("the tree")
- Semester timeline: organise a subject by week, attach materials to weeks, track deadlines
- Priority queue: surfaces which weeks need attention based on deadline proximity and unstudied volume
- Syllabus import: upload a PDF/PPTX/TXT and AI extracts a week-by-week outline for you to confirm
- Assignment study briefs: grounded, cited study points per deadline — reviewed before use
- Export to Anki (`.apkg`)
- Three AI presets: 🌱 Qwen3 4B (low RAM) · 🌿 8B (default) · 🌳 14B (high quality)

## Architecture

```
React UI  ──invoke/event──►  Rust core (Tauri 2)  ──HTTP loopback──►  Python sidecar (AI)
                                    │                                        │
                                 SQLite                             Ollama · FAISS · Whisper
```

- **React UI** (`src/`) — presentation, review/edit gate, study sessions, dashboard. No AI logic.
- **Rust core** (`src-tauri/`) — orchestration: sidecar lifecycle, SQLite, Tauri IPC commands.
- **Python sidecar** (`sidecar/`) — all AI: ingest, transcribe, RAG, LLM generation, FSRS, export.

The sidecar is loopback-only and spawned by Tauri automatically. See [`docs/architecture.md`](./docs/architecture.md).

## Repository layout

```
arbora/
├── src/             React frontend (Vite) — feature-sliced
│   ├── app/         app shell + router (App.tsx, main.tsx)
│   ├── lib/         ipc.ts (only door to core) + api.ts facade
│   ├── features/    one folder per capability (review, study, timeline, plan…)
│   └── components/  shared presentational primitives
├── src-tauri/       Rust core — Tauri commands, SQLite migrations, sidecar lifecycle
├── sidecar/         Python AI sidecar (FastAPI loopback, pytest suite)
├── shared/          Cross-layer contracts (JSON Schema → TS / Rust / Pydantic)
└── docs/            Architecture + ADRs (why the code is the way it is)
```

## Getting started

**Prerequisites:**
- [Ollama](https://ollama.com) installed and running
- Rust (pinned — see [`rust-toolchain.toml`](./rust-toolchain.toml))
- Node 25 (see [`.nvmrc`](./.nvmrc))
- Python 3.12+

```bash
# 1. Pull the local models
ollama pull qwen3:4b          # 🌱 minimum (2.6 GB) — works on any machine
ollama pull qwen3:8b          # 🌿 default (5.2 GB) — recommended
ollama pull nomic-embed-text  # embeddings (274 MB) — required

# 2. Python sidecar
cd sidecar
python -m venv .venv
.venv\Scripts\activate        # Windows; use source .venv/bin/activate on macOS/Linux
pip install -r requirements.lock

# 3. Frontend + Tauri (from repo root)
cd ..
npm install
npm run tauri dev             # Tauri spawns the sidecar automatically
```

The app opens in a Tauri window. Change the AI preset in Settings to match your machine.

## Running tests

```bash
# Python sidecar
cd sidecar && pytest -q

# Rust core (needs a frontend build first)
npm run build
cd src-tauri && cargo test --locked

# Frontend type-check + build
npm run lint && npm run build
```

**Real-model integration tests** (needs Ollama + a pulled model):
```bash
cd sidecar
ARBORA_RUN_INTEGRATION=1 pytest tests/test_generate_integration.py -v
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for conventions and the PR checklist.
Agent operating guide (skills + the senior-dev loop): [`CLAUDE.md`](./CLAUDE.md).

## License

[MIT](./LICENSE) — free, open-source, install-once.
