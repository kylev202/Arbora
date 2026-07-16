-- Source figures — a PDF's own embedded images, extracted at ingest (ADR-0012).
-- Each row is a citable visual excerpt: the file at `path` was cropped verbatim
-- from `source_id` at `page`. Generated notes may show one beside their prose;
-- the citation is source + page (law #1) and the note is review-gated (law #2).
CREATE TABLE source_figures (
    id         TEXT PRIMARY KEY,
    source_id  TEXT NOT NULL,
    page       INTEGER NOT NULL,          -- 1-based, matches SourceRef page
    path       TEXT NOT NULL,             -- absolute, under $APPDATA/sources/figures
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE INDEX idx_source_figures_source_page ON source_figures(source_id, page);
