-- Track each source's ingest lifecycle so the Sources list can show
-- queued / processing / processed / error across app restarts. `progress` and
-- `step` are transient (streamed as Tauri events while a job runs) and are not
-- persisted — a reloaded source is only ever queued, processed, or error.

ALTER TABLE sources ADD COLUMN ingest_state TEXT NOT NULL DEFAULT 'queued'
    CHECK (ingest_state IN ('queued','processing','processed','error'));

ALTER TABLE sources ADD COLUMN ingest_error TEXT;
