-- All-day calendar events. A due-date todo without a time, or a full-day
-- commitment (exam day, holiday), has no wall-clock slot; all_day=1 rows render
-- in the calendar's all-day strip instead of the hour grid. start_at/end_at
-- still hold the date (T00:00 / T23:59) so window queries and ordering keep
-- working unchanged. Additive only.
ALTER TABLE calendar_events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;
