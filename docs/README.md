# Arbora — Technical Docs

| Doc | What's in it |
| --- | ------------ |
| [architecture.md](./architecture.md) | The three-process design, how the layers talk, where AI safety is enforced. |
| [adr/](./adr/) | Architecture Decision Records — what we decided and why. |

The code stays the source of truth for the moving parts:

- Database schema — [`src-tauri/migrations/0001_initial.sql`](../src-tauri/migrations/0001_initial.sql)
- IPC commands — [`src-tauri/src/commands.rs`](../src-tauri/src/commands.rs) (TS side: [`src/lib/ipc.ts`](../src/lib/ipc.ts))
- Sidecar API — [`sidecar/arbora_ai/server.py`](../sidecar/arbora_ai/server.py)

For how to *work* in this repo (conventions, the skill library, the verify loop), see
[CLAUDE.md](../CLAUDE.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
