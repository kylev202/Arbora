import { Plus, X } from "@phosphor-icons/react";
import { Button, IconButton } from "../../components";
import type { StudyWindowInput } from "../../lib/types";
import styles from "./StudyWindowsEditor.module.css";

/** weekday 0 = Monday … 6 = Sunday (matches the study_windows schema). */
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** True when every window ends after it starts (the backend rejects the rest). */
export function validWindows(windows: StudyWindowInput[]): boolean {
  return windows.every((w) => w.start_time < w.end_time);
}

/**
 * Editable list of weekly study windows, shared by onboarding and Settings.
 * Presentational: the parent owns the list and decides when to persist it.
 */
export function StudyWindowsEditor({
  windows,
  onChange,
}: {
  windows: StudyWindowInput[];
  onChange: (windows: StudyWindowInput[]) => void;
}) {
  function patch(index: number, p: Partial<StudyWindowInput>) {
    onChange(windows.map((w, i) => (i === index ? { ...w, ...p } : w)));
  }

  return (
    <div className={styles.editor}>
      {windows.map((w, i) => (
        <div key={i}>
          <div className={styles.windowRow}>
            <select
              className={styles.control}
              aria-label="Day of week"
              value={w.weekday}
              onChange={(e) => patch(i, { weekday: Number(e.target.value) })}
            >
              {WEEKDAYS.map((d, di) => (
                <option key={d} value={di}>
                  {d}
                </option>
              ))}
            </select>
            <input
              className={styles.control}
              type="time"
              aria-label="From"
              value={w.start_time}
              onChange={(e) => patch(i, { start_time: e.target.value })}
            />
            <span aria-hidden="true">to</span>
            <input
              className={styles.control}
              type="time"
              aria-label="Until"
              value={w.end_time}
              onChange={(e) => patch(i, { end_time: e.target.value })}
            />
            <IconButton
              label="Remove this window"
              icon={<X />}
              size="sm"
              onClick={() => onChange(windows.filter((_, wi) => wi !== i))}
            />
          </div>
          {w.start_time >= w.end_time && (
            <p className={styles.rowError} role="alert">
              This window should end after it starts.
            </p>
          )}
        </div>
      ))}
      <div>
        <Button
          variant="secondary"
          icon={<Plus />}
          onClick={() =>
            onChange([...windows, { weekday: 0, start_time: "18:00", end_time: "20:00" }])
          }
        >
          Add a study window
        </Button>
      </div>
    </div>
  );
}
