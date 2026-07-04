import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { usePopover } from "./usePopover";
import styles from "./DatePicker.module.css";

export type DatePickerProps = {
  label?: string;
  /** ISO date "YYYY-MM-DD", or "" for none. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable day, inclusive ("YYYY-MM-DD"). */
  min?: string;
  placeholder?: string;
  id?: string;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]; // prettier-ignore
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; // Monday-first
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function parse(value: string): { y: number; m: number; d: number } | null {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return { y: parts[0], m: parts[1] - 1, d: parts[2] };
}

function display(value: string): string {
  const p = parse(value);
  if (!p) return "";
  const wd = DAYS_SHORT[new Date(p.y, p.m, p.d).getDay()];
  return `${wd}, ${p.d} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

/** Monday-first offset: JS getDay() is Sun=0. */
const mondayOffset = (jsDay: number) => (jsDay + 6) % 7;

/**
 * Glass calendar picker — replaces <input type="date">, whose OS-drawn popup can't
 * be themed. Portaled to <body>, month grid with prev/next, today + selected marks,
 * `min` to grey out earlier days. Keyboard: arrows move by day/week, PageUp/Down by
 * month, Enter selects, Esc closes. Value is an ISO "YYYY-MM-DD" string.
 */
export function DatePicker({ label, value, onChange, min, placeholder = "Pick a date", id }: DatePickerProps) {
  const autoId = useId();
  const rootId = id ?? autoId;
  const gridId = `${rootId}-grid`;

  const { open, setOpen, coords, triggerRef, popoverRef } = usePopover<HTMLDivElement>(360, 296);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const today = new Date();
  const selected = parse(value);
  // The month currently shown; and the focused day for keyboard nav.
  const [view, setView] = useState(() => selected ?? { y: today.getFullYear(), m: today.getMonth() });
  const [focus, setFocus] = useState(() => selected ?? { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() });

  // Re-seed to the selected month each time it opens.
  useLayoutEffect(() => {
    if (!open) return;
    const seed = parse(value) ?? { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
    setView({ y: seed.y, m: seed.m });
    setFocus(seed);
    const raf = requestAnimationFrame(() => gridRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the focused day rendered inside the shown month.
  useEffect(() => {
    setView({ y: focus.y, m: focus.m });
  }, [focus]);

  const minDate = min ? parse(min) : null;
  const isDisabled = (y: number, m: number, d: number) =>
    minDate ? iso(y, m, d) < iso(minDate.y, minDate.m, minDate.d) : false;

  function pick(y: number, m: number, d: number) {
    if (isDisabled(y, m, d)) return;
    onChange(iso(y, m, d));
    setOpen(false);
    triggerRef.current?.focus();
  }

  function shiftFocus(days: number) {
    const dt = new Date(focus.y, focus.m, focus.d + days);
    setFocus({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() });
  }
  function shiftMonth(delta: number) {
    const dt = new Date(view.y, view.m + delta, 1);
    setView({ y: dt.getFullYear(), m: dt.getMonth() });
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); shiftFocus(-1); break;
      case "ArrowRight": e.preventDefault(); shiftFocus(1); break;
      case "ArrowUp": e.preventDefault(); shiftFocus(-7); break;
      case "ArrowDown": e.preventDefault(); shiftFocus(7); break;
      case "PageUp": e.preventDefault(); shiftMonth(-1); break;
      case "PageDown": e.preventDefault(); shiftMonth(1); break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(focus.y, focus.m, focus.d);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation(); // don't also close the modal
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  }

  // Build the 6×7 grid of days (leading blanks from the previous month).
  const firstDow = mondayOffset(new Date(view.y, view.m, 1).getDay());
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className={styles.field}>
      {label && (
        <span className={styles.label} id={`${rootId}-label`}>
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={rootId}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={label ? `${rootId}-label ${rootId}` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={selected ? styles.value : styles.placeholder}>
          {selected ? display(value) : placeholder}
        </span>
        <CalendarBlank weight="regular" className={styles.icon} />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={label ?? "Choose a date"}
            className={`${styles.popover} ${coords.up ? styles.up : styles.down}`}
            style={{
              top: coords.up ? undefined : coords.top,
              bottom: coords.up ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: coords.width,
            }}
          >
            <div className={styles.head}>
              <button
                type="button"
                className={styles.nav}
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
              >
                <CaretLeft weight="bold" />
              </button>
              <span className={styles.monthLabel} aria-live="polite">
                {MONTHS[view.m]} {view.y}
              </span>
              <button
                type="button"
                className={styles.nav}
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
              >
                <CaretRight weight="bold" />
              </button>
            </div>

            <div className={styles.weekRow} aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <span key={w} className={styles.weekday}>
                  {w}
                </span>
              ))}
            </div>

            <div
              ref={gridRef}
              id={gridId}
              role="grid"
              tabIndex={-1}
              className={styles.grid}
              onKeyDown={onGridKeyDown}
            >
              {cells.map((d, i) => {
                if (d === null) return <span key={`b${i}`} className={styles.blank} />;
                const isSel = !!selected && selected.y === view.y && selected.m === view.m && selected.d === d;
                const isToday =
                  today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
                const isFocus = focus.y === view.y && focus.m === view.m && focus.d === d;
                const disabled = isDisabled(view.y, view.m, d);
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    aria-selected={isSel}
                    aria-current={isToday ? "date" : undefined}
                    disabled={disabled}
                    tabIndex={-1}
                    className={[
                      styles.day,
                      isSel ? styles.selected : "",
                      isToday && !isSel ? styles.today : "",
                      isFocus && !isSel ? styles.focused : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => pick(view.y, view.m, d)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
