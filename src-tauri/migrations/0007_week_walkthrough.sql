-- Week walkthrough: the guided week journey (overview note + lesson notes).
-- Both are AI-generated and staged reviewed = 0; the user approves each note
-- inline on first read (law #2 — reading it IS the review). One walkthrough per
-- week (regenerate replaces it). Lesson chunk keys are recorded so practice
-- questions can be scoped to exactly the material a lesson taught.

CREATE TABLE week_walkthroughs (
    id           TEXT PRIMARY KEY,
    subject_id   TEXT NOT NULL,
    week_id      TEXT NOT NULL UNIQUE,
    overview     TEXT NOT NULL,                 -- Markdown
    reviewed     INTEGER NOT NULL DEFAULT 0,    -- overview approved inline
    completed_at TEXT,                          -- journey finished (ISO)
    created_at   TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (week_id)    REFERENCES weeks(id)    ON DELETE CASCADE
);

CREATE TABLE walkthrough_overview_refs (
    id             TEXT PRIMARY KEY,
    walkthrough_id TEXT NOT NULL,
    source_id      TEXT NOT NULL,
    page           INTEGER,
    timestamp_ms   INTEGER,
    excerpt        TEXT NOT NULL,
    FOREIGN KEY (walkthrough_id) REFERENCES week_walkthroughs(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id)      REFERENCES sources(id)           ON DELETE CASCADE
);

CREATE TABLE walkthrough_lessons (
    id             TEXT PRIMARY KEY,
    walkthrough_id TEXT NOT NULL,
    lesson_index   INTEGER NOT NULL,
    title          TEXT NOT NULL,
    content        TEXT NOT NULL,               -- Markdown
    reviewed       INTEGER NOT NULL DEFAULT 0,  -- note approved inline
    completed_at   TEXT,                        -- checkpoint done (ISO)
    FOREIGN KEY (walkthrough_id) REFERENCES week_walkthroughs(id) ON DELETE CASCADE
);

CREATE TABLE walkthrough_lesson_refs (
    id           TEXT PRIMARY KEY,
    lesson_id    TEXT NOT NULL,
    source_id    TEXT NOT NULL,
    page         INTEGER,
    timestamp_ms INTEGER,
    excerpt      TEXT NOT NULL,
    FOREIGN KEY (lesson_id) REFERENCES walkthrough_lessons(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES sources(id)             ON DELETE CASCADE
);

CREATE TABLE walkthrough_lesson_chunks (
    lesson_id   TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    PRIMARY KEY (lesson_id, source_id, chunk_index),
    FOREIGN KEY (lesson_id) REFERENCES walkthrough_lessons(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES sources(id)             ON DELETE CASCADE
);

CREATE INDEX idx_walkthroughs_week ON week_walkthroughs(week_id);
CREATE INDEX idx_wt_lessons_wt ON walkthrough_lessons(walkthrough_id, lesson_index);
