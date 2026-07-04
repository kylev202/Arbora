-- User highlights & comments on a source's text, shown in the in-app Drive
-- viewer. Anchored by the quoted phrase + page (robust to re-parsing — no
-- fragile character offsets). `note` NULL = a plain highlight; non-NULL = a
-- comment. Additive only.
CREATE TABLE source_annotations (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL,
    page        INTEGER,                        -- 1-based page (NULL for audio/plain text)
    quote       TEXT NOT NULL,                  -- the highlighted phrase
    note        TEXT,                           -- optional comment
    color       TEXT NOT NULL DEFAULT 'gold',
    created_at  TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);
CREATE INDEX idx_annotations_source ON source_annotations(source_id);
