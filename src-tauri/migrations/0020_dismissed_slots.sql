-- Dismissed proposal slots — the negative half of "learn from the user's own
-- choices" (workstream 3, ADR-0013's calm-planning family). When the user
-- dismisses a proposed study session, the (weekday, hour) it fell on is recorded
-- here so the planner gently steers *future proposals* away from times they keep
-- declining. Ordering-only and soft: it never reduces a subject's weekly target,
-- a dismissed time is still used when it is the only free slot, and the accept
-- gate (law #2) remains the sole writer of real calendar events. Local-only
-- (law #3).
CREATE TABLE dismissed_slots (
    id           TEXT PRIMARY KEY,
    weekday      INTEGER NOT NULL,   -- 0=Monday … 6=Sunday (Python planner convention)
    hour         INTEGER NOT NULL,   -- 0–23, local wall clock of the dismissed slot
    dismissed_at TEXT NOT NULL       -- ISO UTC; only recent dismissals count (recency horizon)
);

CREATE INDEX idx_dismissed_slots_at ON dismissed_slots(dismissed_at);
