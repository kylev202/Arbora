-- Add FSRS v6 step column to card_schedule.
-- step tracks which learning step the card is on (NULL = graduated to Review).
-- Existing rows get step=0 (unreviewed new cards); they will be corrected on
-- first review by the sidecar.
ALTER TABLE card_schedule ADD COLUMN step INTEGER;
