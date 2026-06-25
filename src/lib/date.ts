/** Date helpers. Countdowns are deliberately NEUTRAL — never red, never "late!". */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from now until `iso` (negative = past). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const then = new Date(iso);
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / DAY_MS);
}

/** Calm relative label, e.g. "in 27 days", "today", "2 days ago". */
export function relativeDays(iso: string, now?: Date): string {
  const d = daysUntil(iso, now);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d > 0) return `in ${d} days`;
  return `${Math.abs(d)} days ago`;
}

/** Short date like "21 Jul 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
