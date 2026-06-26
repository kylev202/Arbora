-- Semester planning: a unit outline (term + weeks), materials/assignments linked
-- to weeks, and a review-gated AI study brief per assignment.
-- Conventions match 0001: TEXT UUIDv4 ids, ISO-8601 UTC text, INTEGER 0/1 bools.

-- ── outline metadata on the subject (1:1, optional) ────────────────────────
-- term_start = ISO date (YYYY-MM-DD) of week 1; NULL = no outline set yet.
ALTER TABLE subjects ADD COLUMN term_start TEXT;
ALTER TABLE subjects ADD COLUMN week_count INTEGER;

-- ── weeks ──────────────────────────────────────────────────────────────────
CREATE TABLE weeks (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    week_number INTEGER NOT NULL,                 -- 1-based
    title       TEXT NOT NULL DEFAULT '',         -- topic for the week
    summary     TEXT NOT NULL DEFAULT '',         -- what's covered
    start_date  TEXT,                             -- ISO date; derived from term_start, editable
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE (subject_id, week_number)
);
CREATE INDEX idx_weeks_subject ON weeks(subject_id, week_number);

-- ── materials → week ────────────────────────────────────────────────────────
-- Nullable so existing/unassigned sources keep working. ON DELETE SET NULL: a
-- deleted week leaves its materials in place, merely unassigned.
ALTER TABLE sources ADD COLUMN week_id TEXT REFERENCES weeks(id) ON DELETE SET NULL;

-- ── assignment (deadline) ↔ week coverage ───────────────────────────────────
CREATE TABLE assignment_coverage (
    deadline_id TEXT NOT NULL,
    week_id     TEXT NOT NULL,
    PRIMARY KEY (deadline_id, week_id),
    FOREIGN KEY (deadline_id) REFERENCES deadlines(id) ON DELETE CASCADE,
    FOREIGN KEY (week_id)     REFERENCES weeks(id)     ON DELETE CASCADE
);

-- ── AI study brief per assignment (grounded + cited + review-gated) ──────────
-- Modeled on notes/note_source_refs: only reviewed=1 is trusted (law #2).
CREATE TABLE assignment_briefs (
    id          TEXT PRIMARY KEY,
    deadline_id TEXT NOT NULL,
    subject_id  TEXT NOT NULL,
    content     TEXT NOT NULL,                    -- Markdown focus list
    reviewed    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (deadline_id) REFERENCES deadlines(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id)  REFERENCES subjects(id)  ON DELETE CASCADE
);
CREATE INDEX idx_briefs_subject ON assignment_briefs(subject_id, reviewed);

CREATE TABLE assignment_brief_refs (
    id           TEXT PRIMARY KEY,
    brief_id     TEXT NOT NULL,
    source_id    TEXT NOT NULL,
    page         INTEGER,
    timestamp_ms INTEGER,
    excerpt      TEXT NOT NULL,
    FOREIGN KEY (brief_id)  REFERENCES assignment_briefs(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES sources(id)           ON DELETE CASCADE
);
CREATE INDEX idx_brief_refs_brief ON assignment_brief_refs(brief_id);
