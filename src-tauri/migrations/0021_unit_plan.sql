-- Deep unit plan — the "unit at a glance", mark map, and per-week detail a real
-- unit outline carries, extracted from the user's own syllabus in a background
-- pass after the fast outline import commits.
--
-- Everything here is *extracted from the syllabus*, not study content generated
-- about it: the same posture ADR-0006 set for the outline parse. Nothing lands
-- until the user accepts the draft (review-before-trust), which is what
-- `unit_plan_drafts` exists to hold.
--
-- Conventions match 0001: TEXT UUIDv4 ids, ISO-8601 UTC text, INTEGER 0/1 bools.

-- ── (a) unit_info: the rest of "unit at a glance" ───────────────────────────
-- Aim / ULOs / assumed knowledge / platform are the headings students actually
-- revise against, and the syllabus states all of them.
ALTER TABLE unit_info ADD COLUMN aim               TEXT NOT NULL DEFAULT '';
ALTER TABLE unit_info ADD COLUMN assumed_knowledge TEXT NOT NULL DEFAULT '';
ALTER TABLE unit_info ADD COLUMN platform          TEXT NOT NULL DEFAULT '';  -- tools/labs the unit runs on
ALTER TABLE unit_info ADD COLUMN credit_points     TEXT NOT NULL DEFAULT '';  -- verbatim, e.g. '12.5 CP'

-- ── (b) unit learning outcomes ──────────────────────────────────────────────
-- Every assessment maps to these, so they double as revision headings.
CREATE TABLE unit_outcomes (
    id         TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    code       TEXT NOT NULL DEFAULT '',   -- 'ULO1' / 'CLO2' / '' as written
    text       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_unit_outcomes_subject ON unit_outcomes(subject_id, position);

-- ── (c) teaching staff ──────────────────────────────────────────────────────
-- Replaces the single coordinator_name/contact pair: real unit guides list a
-- convenor, a lecturer, and tutors, each with their own consultation window.
-- The existing coordinator (if any) becomes row 0 so nothing is lost.
CREATE TABLE unit_staff (
    id           TEXT PRIMARY KEY,
    subject_id   TEXT NOT NULL,
    name         TEXT NOT NULL DEFAULT '',
    role         TEXT NOT NULL DEFAULT '',   -- 'Unit Coordinator', 'Lecturer', 'Tutor'…
    contact      TEXT NOT NULL DEFAULT '',   -- email / office, as written
    consultation TEXT NOT NULL DEFAULT '',   -- 'Mon 14:00–15:00' / 'Refer to Canvas'
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_unit_staff_subject ON unit_staff(subject_id, position);

INSERT INTO unit_staff (id, subject_id, name, role, contact, consultation, position, created_at)
    SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
           substr(lower(hex(randomblob(2))), 2) || '-a' ||
           substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
           subject_id, coordinator_name, 'Unit Coordinator', coordinator_contact, '', 0,
           strftime('%Y-%m-%dT%H:%M:%SZ','now')
    FROM unit_info
    WHERE trim(coordinator_name) <> '' OR trim(coordinator_contact) <> '';

ALTER TABLE unit_info DROP COLUMN coordinator_name;
ALTER TABLE unit_info DROP COLUMN coordinator_contact;

-- ── (d) assessment mark map ─────────────────────────────────────────────────
-- The grade book (`grades`) stays the place scores live; this is the syllabus's
-- own assessment table — weighting, when it's due, individual vs group, and the
-- outcomes it maps to — which the grade book has no room for. Pre-filling
-- `grades` from these rows is unchanged.
CREATE TABLE unit_assessments (
    id             TEXT PRIMARY KEY,
    subject_id     TEXT NOT NULL,
    name           TEXT NOT NULL,
    weight_percent REAL NOT NULL DEFAULT 0,    -- 0 = not stated
    due_text       TEXT NOT NULL DEFAULT '',   -- verbatim: 'Week 6', '20 Oct, 23:59'
    kind           TEXT NOT NULL DEFAULT '',   -- verbatim: 'Individual', 'Group of 3–4'
    outcomes       TEXT NOT NULL DEFAULT '',   -- verbatim: 'ULO1, ULO3'
    position       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_unit_assessments_subject ON unit_assessments(subject_id, position);

-- ── (e) per-week detail ─────────────────────────────────────────────────────
-- `title`/`summary` already hold the week's topic; these add what the weekly
-- activities table states alongside it.
ALTER TABLE weeks ADD COLUMN lecture         TEXT NOT NULL DEFAULT '';
ALTER TABLE weeks ADD COLUMN lab             TEXT NOT NULL DEFAULT '';
ALTER TABLE weeks ADD COLUMN assessment_note TEXT NOT NULL DEFAULT '';  -- what's due that week

-- Focus points and deliverables for a week, same shape as `assignment_items`.
CREATE TABLE week_items (
    id         TEXT PRIMARY KEY,
    week_id    TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('focus','deliverable')),
    text       TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,   -- checklist state (deliverables)
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE CASCADE
);
CREATE INDEX idx_week_items_week ON week_items(week_id, kind, position);

-- ── (f) the uncommitted draft ───────────────────────────────────────────────
-- The deep pass runs in the background after import, so its result has to
-- survive until the user opens the review gate (and across an app restart).
-- One draft per subject; `file_path` is kept so a failed pass can be retried
-- without re-picking the syllabus.
CREATE TABLE unit_plan_drafts (
    subject_id TEXT PRIMARY KEY,
    state      TEXT NOT NULL CHECK (state IN ('running','ready','error')),
    file_path  TEXT NOT NULL DEFAULT '',
    payload    TEXT NOT NULL DEFAULT '',   -- JSON: the extracted-but-unwritten plan
    error      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
