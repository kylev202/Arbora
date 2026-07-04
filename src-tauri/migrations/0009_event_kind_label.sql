-- Allow users to describe what "Other" means for a calendar event.
ALTER TABLE calendar_events ADD COLUMN kind_label TEXT;
