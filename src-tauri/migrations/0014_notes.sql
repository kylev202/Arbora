-- User-authored notes (OneNote-style), distinct from the AI-generated, cited
-- `notes` table. Folders form a shallow tree: one auto 'subject' folder per
-- subject, a single 'quick' folder for quick captures, and freeform 'user'
-- folders (optionally nested). Additive only.
CREATE TABLE note_folders (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT,                            -- set for 'subject' folders, else NULL
    parent_id   TEXT,                            -- nesting for 'user' subfolders
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'user' CHECK (kind IN ('subject','user','quick')),
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)     ON DELETE CASCADE,
    FOREIGN KEY (parent_id)  REFERENCES note_folders(id) ON DELETE CASCADE
);
CREATE INDEX idx_note_folders_parent ON note_folders(parent_id);

CREATE TABLE user_notes (
    id          TEXT PRIMARY KEY,
    folder_id   TEXT NOT NULL,
    subject_id  TEXT,                            -- mirrors the folder's subject, for cross-links
    title       TEXT NOT NULL DEFAULT 'Untitled',
    content     TEXT NOT NULL DEFAULT '',        -- TipTap HTML
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (folder_id)  REFERENCES note_folders(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)     ON DELETE SET NULL
);
CREATE INDEX idx_user_notes_folder ON user_notes(folder_id);
