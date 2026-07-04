-- Add 'class' to the calendar_events kind constraint.
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE calendar_events_new (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT,
    title       TEXT NOT NULL,
    start_at    TEXT NOT NULL,
    end_at      TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('lecture','study','deadline','custom','class')),
    status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','moved')),
    origin      TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user','ai')),
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

INSERT INTO calendar_events_new SELECT * FROM calendar_events;

DROP TABLE calendar_events;
ALTER TABLE calendar_events_new RENAME TO calendar_events;

CREATE INDEX idx_events_start ON calendar_events(start_at);
CREATE INDEX idx_events_subject ON calendar_events(subject_id);

PRAGMA foreign_keys = ON;
