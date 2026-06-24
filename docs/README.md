# Arbora — Technical Docs

Implementation-level documentation lives here as the codebase grows
(architecture notes, data model, the React ↔ Rust ↔ sidecar IPC contract,
and AI output schemas).

For now the code is the source of truth:

- Database schema — [`src-tauri/migrations/0001_initial.sql`](../src-tauri/migrations/0001_initial.sql)
- IPC commands — [`src-tauri/src/commands.rs`](../src-tauri/src/commands.rs)
- Sidecar API — [`sidecar/arbora_ai/server.py`](../sidecar/arbora_ai/server.py)
