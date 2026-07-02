/** Date helpers for the calendar. Event times are naive local ISO
 * ("YYYY-MM-DDTHH:MM") — wall-clock semantics, no timezone math. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → naive local ISO (minute precision). */
export function toNaive(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Naive local ISO → Date (local). Accepts date-only strings too. */
export function parseNaive(s: string): Date {
  const [datePart, timePart = "00:00"] = s.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** Monday 00:00 of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (out.getDay() + 6) % 7; // 0 = Monday
  out.setDate(out.getDate() - day);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60_000);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "09:30" from a naive ISO string. */
export function fmtTime(s: string): string {
  return s.split("T")[1] ?? "";
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Mon 6" — weekday + day-of-month column header. */
export function fmtDayLabel(d: Date): string {
  return `${DAY_NAMES[(d.getDay() + 6) % 7]} ${d.getDate()}`;
}

/** "July 2026" heading. */
export function fmtMonth(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** 6 rows × 7 days covering the month of `d`, starting on a Monday. */
export function monthGrid(d: Date): Date[][] {
  const first = startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));
  const rows: Date[][] = [];
  for (let r = 0; r < 6; r++) {
    rows.push(Array.from({ length: 7 }, (_, c) => addDays(first, r * 7 + c)));
  }
  return rows;
}
