-- Redesign v2.0 slice A — user profile + weekly study windows for onboarding
-- personalisation and the (later) AI scheduler. Additive only; every profile
-- field is nullable so a fully skipped onboarding is a valid state.
-- Conventions match 0001: ISO-8601 text dates, "HH:MM" local times.
-- NOTE: the AI preset is NOT duplicated here — settings.ai_preset stays the
-- single source of truth (onboarding writes it via update_settings).

-- ── user_profile (singleton, like settings) ────────────────────────────────
CREATE TABLE user_profile (
    id          INTEGER PRIMARY KEY CHECK (id = 1),   -- exactly one row
    name        TEXT,
    year        TEXT,                                 -- year of study / grade, free text
    major       TEXT,
    term_start  TEXT,                                 -- ISO date (YYYY-MM-DD)
    term_end    TEXT,                                 -- ISO date (YYYY-MM-DD)
    wake_time   TEXT,                                 -- "HH:MM" local
    sleep_time  TEXT,                                 -- "HH:MM" local
    goal        TEXT CHECK (goal IN ('pass','high_gpa')),
    updated_at  TEXT NOT NULL
);
INSERT INTO user_profile (id, updated_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- ── study_windows (many rows) ───────────────────────────────────────────────
-- Weekly recurring free-to-study slots; scheduler input. weekday: 0=Monday …
-- 6=Sunday. start_time/end_time: "HH:MM" local (END is an SQLite keyword).
CREATE TABLE study_windows (
    id          TEXT PRIMARY KEY,
    weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX idx_study_windows_weekday ON study_windows(weekday, start_time);
