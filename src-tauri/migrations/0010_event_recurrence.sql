-- Tag events that belong to a repeating series so they can be managed together.
-- NULL means a one-off event; a UUID groups all occurrences of the same repeat rule.
ALTER TABLE calendar_events ADD COLUMN recurrence_group_id TEXT;
CREATE INDEX idx_events_group ON calendar_events(recurrence_group_id) WHERE recurrence_group_id IS NOT NULL;
