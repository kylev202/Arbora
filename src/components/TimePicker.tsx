import { useMemo } from "react";
import { Select, type SelectOption } from "./Select";

export type TimePickerProps = {
  label?: string;
  /** 24-hour "HH:MM". */
  value: string;
  onChange: (value: string) => void;
  /** Minutes between options (default 15). */
  step?: number;
  id?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 15-minute grid across the day; caches per step so it's built once. */
const gridCache = new Map<number, SelectOption<string>[]>();
function grid(step: number): SelectOption<string>[] {
  let opts = gridCache.get(step);
  if (!opts) {
    opts = [];
    for (let mins = 0; mins < 24 * 60; mins += step) {
      const v = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
      opts.push({ value: v, label: v });
    }
    gridCache.set(step, opts);
  }
  return opts;
}

/**
 * Glass time picker — the listbox Select fed a day-long grid of times, so it inherits
 * the same styling, keyboard nav, and type-ahead ("18" jumps to 18:00). An off-grid
 * current value (e.g. an event saved at 18:07) is inserted so it still shows correctly.
 */
export function TimePicker({ label, value, onChange, step = 15, id }: TimePickerProps) {
  const options = useMemo(() => {
    const base = grid(step);
    if (value && !base.some((o) => o.value === value)) {
      return [...base, { value, label: value }].sort((a, b) => a.value.localeCompare(b.value));
    }
    return base;
  }, [value, step]);

  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Time"
      id={id}
    />
  );
}
