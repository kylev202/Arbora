-- Subject discipline — steers subject-aware generation (math/STEM emits LaTeX,
-- CS emits fenced code, etc.). 'general' keeps the existing text-only behaviour,
-- so every pre-existing subject is unaffected until the user picks a discipline.
ALTER TABLE subjects ADD COLUMN discipline TEXT NOT NULL DEFAULT 'general';
