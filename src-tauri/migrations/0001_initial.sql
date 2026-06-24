-- Arbora initial schema (Phase 2 skeleton).
-- Source of truth: resources/Phase1_Data_Model.md §3.
-- Conventions: TEXT UUIDv4 ids, ISO-8601 UTC text timestamps, INTEGER 0/1 booleans.
-- Foreign keys are enforced at the connection level (PRAGMA foreign_keys = ON).

-- ── subjects ──────────────────────────────────────────────────────────────
CREATE TABLE subjects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#4A7C59',   -- hex
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- ── sources ───────────────────────────────────────────────────────────────
CREATE TABLE sources (
    id           TEXT PRIMARY KEY,
    subject_id   TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('pdf','slide','audio')),
    file_path    TEXT NOT NULL,
    title        TEXT NOT NULL,
    page_count   INTEGER,                  -- null for audio
    duration_ms  INTEGER,                  -- null for pdf/slide
    ingested_at  TEXT,                     -- null = not ingested yet
    chunk_count  INTEGER,
    created_at   TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_sources_subject ON sources(subject_id);

-- ── chunks ────────────────────────────────────────────────────────────────
CREATE TABLE chunks (
    id            TEXT PRIMARY KEY,
    source_id     TEXT NOT NULL,
    subject_id    TEXT NOT NULL,           -- denormalized for fast per-subject RAG queries
    text          TEXT NOT NULL,
    page          INTEGER,                 -- citation: pdf/slide use page
    timestamp_ms  INTEGER,                 -- citation: audio uses timestamp
    faiss_id      INTEGER NOT NULL,        -- position in the subject's FAISS index
    chunk_index   INTEGER NOT NULL,        -- order within the source
    FOREIGN KEY (source_id)  REFERENCES sources(id)  ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_chunks_source  ON chunks(source_id);
CREATE INDEX idx_chunks_subject ON chunks(subject_id);
CREATE UNIQUE INDEX idx_chunks_faiss ON chunks(subject_id, faiss_id);

-- ── notes + note_source_refs ──────────────────────────────────────────────
CREATE TABLE notes (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    content     TEXT NOT NULL,                       -- Markdown
    format      TEXT NOT NULL CHECK (format IN ('cornell','outline')),
    reviewed    INTEGER NOT NULL DEFAULT 0,          -- review-before-trust gate
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_notes_subject ON notes(subject_id);

CREATE TABLE note_source_refs (
    id           TEXT PRIMARY KEY,
    note_id      TEXT NOT NULL,
    source_id    TEXT NOT NULL,
    page         INTEGER,
    timestamp_ms INTEGER,
    excerpt      TEXT NOT NULL,
    FOREIGN KEY (note_id)   REFERENCES notes(id)   ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);
CREATE INDEX idx_note_refs_note ON note_source_refs(note_id);

-- ── cards + card_schedule ─────────────────────────────────────────────────
CREATE TABLE cards (
    id            TEXT PRIMARY KEY,
    subject_id    TEXT NOT NULL,
    front         TEXT NOT NULL,
    back          TEXT NOT NULL,
    explanation   TEXT NOT NULL DEFAULT '',
    source_id     TEXT NOT NULL,                      -- one card = one source citation
    page          INTEGER,
    timestamp_ms  INTEGER,
    excerpt       TEXT NOT NULL,
    reviewed      INTEGER NOT NULL DEFAULT 0,         -- only reviewed=1 enters FSRS schedule
    created_at    TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id)  REFERENCES sources(id)  ON DELETE CASCADE
);
CREATE INDEX idx_cards_subject  ON cards(subject_id);
CREATE INDEX idx_cards_reviewed ON cards(subject_id, reviewed);

-- FSRS state — a row is created only when a card is approved (reviewed=1).
CREATE TABLE card_schedule (
    card_id      TEXT PRIMARY KEY,
    due          TEXT NOT NULL,                       -- ISO datetime
    stability    REAL NOT NULL,
    difficulty   REAL NOT NULL,
    state        TEXT NOT NULL CHECK (state IN ('new','learning','review','relearning')),
    reps         INTEGER NOT NULL DEFAULT 0,
    lapses       INTEGER NOT NULL DEFAULT 0,
    last_review  TEXT,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);
CREATE INDEX idx_schedule_due ON card_schedule(due);

-- ── quizzes + quiz_items ──────────────────────────────────────────────────
CREATE TABLE quizzes (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_quizzes_subject ON quizzes(subject_id);

CREATE TABLE quiz_items (
    id            TEXT PRIMARY KEY,
    quiz_id       TEXT NOT NULL,
    subject_id    TEXT NOT NULL,                      -- denormalized for the review queue
    question      TEXT NOT NULL,
    options_json  TEXT NOT NULL,                      -- JSON array of 4 strings
    answer_index  INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
    explanation   TEXT NOT NULL DEFAULT '',
    source_id     TEXT NOT NULL,
    page          INTEGER,
    timestamp_ms  INTEGER,
    excerpt       TEXT NOT NULL,
    reviewed      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (quiz_id)    REFERENCES quizzes(id)  ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id)  REFERENCES sources(id)  ON DELETE CASCADE
);
CREATE INDEX idx_quiz_items_quiz     ON quiz_items(quiz_id);
CREATE INDEX idx_quiz_items_reviewed ON quiz_items(subject_id, reviewed);

-- ── deadlines ─────────────────────────────────────────────────────────────
CREATE TABLE deadlines (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    title       TEXT NOT NULL,
    due_at      TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('exam','assignment','other')),
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_deadlines_subject ON deadlines(subject_id, due_at);

-- ── study_sessions ────────────────────────────────────────────────────────
CREATE TABLE study_sessions (
    id             TEXT PRIMARY KEY,
    subject_id     TEXT NOT NULL,
    started_at     TEXT NOT NULL,
    ended_at       TEXT,
    cards_reviewed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_subject ON study_sessions(subject_id, started_at);

-- ── grades ────────────────────────────────────────────────────────────────
CREATE TABLE grades (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    score       REAL,                                 -- null = no score yet (for what-if)
    max_score   REAL NOT NULL DEFAULT 100,
    weight      REAL NOT NULL DEFAULT 0,              -- 0.0–1.0
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_grades_subject ON grades(subject_id);

-- ── concepts + concept_cards (created from MVP, populated deeply in Phase 2) ─
CREATE TABLE concepts (
    id            TEXT PRIMARY KEY,
    subject_id    TEXT NOT NULL,
    name          TEXT NOT NULL,
    mastery_state TEXT NOT NULL DEFAULT 'new'
                  CHECK (mastery_state IN ('new','learning','mastered','needs_review')),
    created_at    TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_concepts_subject ON concepts(subject_id);

CREATE TABLE concept_cards (
    concept_id TEXT NOT NULL,
    card_id    TEXT NOT NULL,
    PRIMARY KEY (concept_id, card_id),
    FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
    FOREIGN KEY (card_id)    REFERENCES cards(id)    ON DELETE CASCADE
);

-- ── settings (singleton) ──────────────────────────────────────────────────
CREATE TABLE settings (
    id              INTEGER PRIMARY KEY CHECK (id = 1),   -- exactly one row
    ai_preset       TEXT NOT NULL DEFAULT 'medium'
                    CHECK (ai_preset IN ('low','medium','high')),
    whisper_model   TEXT NOT NULL DEFAULT 'base'
                    CHECK (whisper_model IN ('tiny','base','small')),
    byo_key_enabled INTEGER NOT NULL DEFAULT 0,
    byo_provider    TEXT,
    byo_endpoint    TEXT,
    -- byo_api_key is NOT stored here — it lives in the OS keychain.
    onboarded       INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL
);
INSERT INTO settings (id, updated_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));
