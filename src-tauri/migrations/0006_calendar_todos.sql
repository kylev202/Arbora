-- Redesign v2.0 slice D — timetable events + todos for the home screen and the
-- (later) AI scheduler. Additive only.
-- Times are naive local ISO ("YYYY-MM-DDTHH:MM"): a study session is a
-- wall-clock commitment, so no UTC conversion (unlike created_at bookkeeping).
-- Column names start_at/end_at because END is an SQLite keyword.

CREATE TABLE calendar_events (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT,                                -- nullable: personal events
    title       TEXT NOT NULL,
    start_at    TEXT NOT NULL,
    end_at      TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('lecture','study','deadline','custom')),
    status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','moved')),
    origin      TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user','ai')),
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_events_start ON calendar_events(start_at);
CREATE INDEX idx_events_subject ON calendar_events(subject_id);

-- Todos shown on the home panel. `session_slot` optionally pins a todo to the
-- study session meant to complete it. `kind` is free text ("task" default;
-- the AI phase adds kinds like "study"/"review"/"prep"). `source` tracks who
-- created it — AI todos are suggestions the user can freely edit (law #2).
CREATE TABLE todos (
    id            TEXT PRIMARY KEY,
    subject_id    TEXT,
    title         TEXT NOT NULL,
    due           TEXT,                              -- naive local ISO date/datetime
    session_slot  TEXT,
    kind          TEXT NOT NULL DEFAULT 'task',
    done          INTEGER NOT NULL DEFAULT 0,
    source        TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('setup','ai','user')),
    created_at    TEXT NOT NULL,
    FOREIGN KEY (subject_id)   REFERENCES subjects(id)        ON DELETE CASCADE,
    FOREIGN KEY (session_slot) REFERENCES calendar_events(id) ON DELETE SET NULL
);
CREATE INDEX idx_todos_done ON todos(done, due);
