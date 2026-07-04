-- Drive folders: a user-managed folder tree for organizing sources (files),
-- parallel to the automatic per-subject grouping. A folder is subject-
-- independent; a source keeps its `subject_id` (FAISS index scoping, law #1)
-- and gains an optional `folder_id` for organization. Additive only.
CREATE TABLE source_folders (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT,                            -- nesting for subfolders
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES source_folders(id) ON DELETE CASCADE
);
CREATE INDEX idx_source_folders_parent ON source_folders(parent_id);

-- Nullable FK: deleting a folder detaches its files (they fall back to their
-- subject folder / "All files"), never deletes them.
ALTER TABLE sources ADD COLUMN folder_id TEXT REFERENCES source_folders(id) ON DELETE SET NULL;
CREATE INDEX idx_sources_folder ON sources(folder_id);
