-- Detail fields for the dedicated Todos manager (MS-To-Do style): freeform
-- notes, an optional repeat interval, and a link to the calendar event that is
-- auto-created to mirror a todo's due date. Additive only.
ALTER TABLE todos ADD COLUMN notes TEXT;
ALTER TABLE todos ADD COLUMN repeat TEXT;            -- 'daily'|'weekly'|'monthly', NULL = one-off
ALTER TABLE todos ADD COLUMN linked_event_id TEXT;   -- calendar_events.id mirror of `due`, NULL = none
