# Contributing to Arbora

Thanks for your interest in Arbora 🌳. This guide covers how to set up the project and the
conventions we follow.

## Ground rules

Arbora has three non-negotiable principles. Any change that touches AI generation must respect them:

1. **Grounded + cited** — generated content comes only from source material; every item carries a citation.
2. **Review-before-trust** — no AI-generated item is persisted as trusted until a human approves it.
3. **Local-first** — the core never sends data off-device. Network code (BYO key / online) lives in
   isolated modules behind an explicit opt-in flag and is never imported by the core.

## Project layout

See [README](./README.md#repository-layout). In short: `src/` (React), `src-tauri/` (Rust core),
`sidecar/` (Python AI). Cross-layer data contracts live in `shared/` and are the source of truth.

## Development setup

Follow [README → Development setup](./README.md#development-setup).

## Conventions

- **Language:** planning docs are in Vietnamese; **code, comments, and commit messages are in English**.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — e.g. `feat(sidecar): add /health endpoint`.
- **Structured output:** never parse free-text from an LLM. Constrain with a schema, validate, retry, then error.
- **Citations are first-class:** an AI item that cannot be traced to a source is a bug, not a warning.
- **Pin versions:** lockfiles (`Cargo.lock`, `package-lock.json`, `requirements.lock`) are committed. Update deliberately.
- **Test on weak hardware:** AI features must be verified on the low preset (Qwen3 4B / Whisper base).

## Before opening a PR

- `cargo fmt && cargo clippy` (Rust)
- `npm run lint` (frontend)
- `ruff check . && pytest` (sidecar)
- Make sure CI passes on all three OSes.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree to uphold it.
