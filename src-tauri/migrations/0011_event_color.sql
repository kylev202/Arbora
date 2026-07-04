-- Optional per-event accent colour. NULL = fall back to the kind-based colour.
ALTER TABLE calendar_events ADD COLUMN color TEXT;
