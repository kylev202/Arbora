-- Unit info + assignment spec/rubric storage, and a sources.type fix.
-- Conventions match 0001: TEXT UUIDv4 ids, ISO-8601 UTC text, INTEGER 0/1 bools.
--
-- REQUIRES foreign keys OFF on the migrating connection (db.rs guarantees
-- this): sqlx wraps SQLite migrations in a transaction, where a
-- `PRAGMA foreign_keys = OFF` statement would be a silent no-op — and with
-- FKs ON, the `DROP TABLE sources` below would fire the children's
-- ON DELETE CASCADE and silently wipe every chunk/annotation/citation ref.

-- ── (a) sources.type: widen CHECK to what detect_type actually emits ────────
-- The Rust/Python `detect_type` has returned 'doc' (docx) and 'text' (txt/md)
-- since Drive shipped, but the 0001 CHECK only allowed pdf|slide|audio, so
-- importing those files failed at insert. SQLite can't alter a CHECK, so
-- rebuild the table (same recipe as 0008 for calendar_events).
CREATE TABLE sources_new (
    id           TEXT PRIMARY KEY,
    subject_id   TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('pdf','slide','audio','doc','text')),
    file_path    TEXT NOT NULL,
    title        TEXT NOT NULL,
    page_count   INTEGER,                  -- null for audio
    duration_ms  INTEGER,                  -- null for pdf/slide
    ingested_at  TEXT,                     -- null = not ingested yet
    chunk_count  INTEGER,
    created_at   TEXT NOT NULL,
    ingest_state TEXT NOT NULL DEFAULT 'queued'
                 CHECK (ingest_state IN ('queued','processing','processed','error')),
    ingest_error TEXT,
    week_id      TEXT REFERENCES weeks(id) ON DELETE SET NULL,
    folder_id    TEXT REFERENCES source_folders(id) ON DELETE SET NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
INSERT INTO sources_new
    SELECT id, subject_id, type, file_path, title, page_count, duration_ms,
           ingested_at, chunk_count, created_at, ingest_state, ingest_error,
           week_id, folder_id
    FROM sources;
DROP TABLE sources;
ALTER TABLE sources_new RENAME TO sources;
CREATE INDEX idx_sources_subject ON sources(subject_id);
CREATE INDEX idx_sources_folder  ON sources(folder_id);

-- ── (b) unit info (1:1 with subject) + classes (display only) ────────────────
-- Extracted from the syllabus during outline import, reviewed before commit.
CREATE TABLE unit_info (
    subject_id          TEXT PRIMARY KEY,
    unit_code           TEXT NOT NULL DEFAULT '',
    coordinator_name    TEXT NOT NULL DEFAULT '',
    coordinator_contact TEXT NOT NULL DEFAULT '',
    delivery_summary    TEXT NOT NULL DEFAULT '',  -- how the unit runs
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE unit_classes (
    id         TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    label      TEXT NOT NULL DEFAULT '',       -- Lecture / Tutorial / Lab …
    schedule   TEXT NOT NULL DEFAULT '',       -- "Wed 10:00–11:00" (plain text)
    mode       TEXT NOT NULL DEFAULT '',       -- 'on-campus' | 'online' | ''
    attendance TEXT NOT NULL DEFAULT '',       -- e.g. "attendance is a hurdle"
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_unit_classes_subject ON unit_classes(subject_id, position);

-- ── (c) deadline ↔ source links (one spec + one rubric per assignment) ──────
-- PK (deadline_id, role): re-uploading replaces the link, never duplicates it.
-- The old file stays in the source library as a normal source.
CREATE TABLE deadline_sources (
    deadline_id TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('spec','rubric')),
    source_id   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (deadline_id, role),
    FOREIGN KEY (deadline_id) REFERENCES deadlines(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id)   REFERENCES sources(id)   ON DELETE CASCADE
);

-- ── (d) assignment detail: overview + requirements/process/plan items ───────
-- Extracted from the uploaded assignment spec, reviewed before commit.
CREATE TABLE assignment_details (
    deadline_id TEXT PRIMARY KEY,
    overview    TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (deadline_id) REFERENCES deadlines(id) ON DELETE CASCADE
);

CREATE TABLE assignment_items (
    id          TEXT PRIMARY KEY,
    deadline_id TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('requirement','process','plan')),
    text        TEXT NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,   -- checklist state (process/plan)
    position    INTEGER NOT NULL DEFAULT 0,
    todo_id     TEXT REFERENCES todos(id) ON DELETE SET NULL, -- "added to todos"
    created_at  TEXT NOT NULL,
    FOREIGN KEY (deadline_id) REFERENCES deadlines(id) ON DELETE CASCADE
);
CREATE INDEX idx_assignment_items_deadline ON assignment_items(deadline_id, kind, position);

-- ── (e) rubric: criteria × levels ────────────────────────────────────────────
CREATE TABLE rubric_criteria (
    id          TEXT PRIMARY KEY,
    deadline_id TEXT NOT NULL,
    name        TEXT NOT NULL,
    weight_text TEXT NOT NULL DEFAULT '',     -- loose: "30%", "3 marks", ''
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (deadline_id) REFERENCES deadlines(id) ON DELETE CASCADE
);
CREATE INDEX idx_rubric_criteria_deadline ON rubric_criteria(deadline_id, position);

CREATE TABLE rubric_levels (
    id           TEXT PRIMARY KEY,
    criterion_id TEXT NOT NULL,
    label        TEXT NOT NULL,               -- e.g. HD / Distinction / Pass
    descriptor   TEXT NOT NULL DEFAULT '',
    position     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (criterion_id) REFERENCES rubric_criteria(id) ON DELETE CASCADE
);
CREATE INDEX idx_rubric_levels_criterion ON rubric_levels(criterion_id, position);
