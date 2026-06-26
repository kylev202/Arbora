import { useEffect, useState } from "react";
import { Button, Input, Modal, Textarea } from "../../components";
import type { Outline, Week } from "../../lib/types";
import styles from "./OutlineEditor.module.css";

/**
 * Outline-editing modals — the manual semester-structure controls. The Timeline
 * (slice 2) hosts these: `SetupOutlineModal` sets the term start + week count,
 * `EditWeekModal` fills in a single week's topic. Dates are neutral, never "late".
 */

export function SetupOutlineModal({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: Outline | null;
  onSave: (termStart: string | null, weekCount: number) => void;
}) {
  const [termStart, setTermStart] = useState("");
  const [weeks, setWeeks] = useState("12");

  useEffect(() => {
    if (open) {
      setTermStart(initial?.term_start ?? "");
      setWeeks(initial?.week_count != null ? String(initial.week_count) : "12");
    }
  }, [open, initial]);

  const n = Number(weeks);
  const valid = Number.isInteger(n) && n >= 1 && n <= 53;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unit outline"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => valid && onSave(termStart.trim() || null, n)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Input
          label="Term start (week 1)"
          type="date"
          value={termStart}
          onChange={(e) => setTermStart(e.target.value)}
          hint="Optional — sets each week's date automatically. You can leave it blank."
        />
        <Input
          label="Number of weeks"
          type="number"
          min={1}
          max={53}
          value={weeks}
          onChange={(e) => setWeeks(e.target.value)}
          hint="Lowering this removes trailing weeks; topics you've written are kept."
        />
      </div>
    </Modal>
  );
}

export function EditWeekModal({
  week,
  onClose,
  onSave,
}: {
  week: Week | null;
  onClose: () => void;
  onSave: (patch: { title: string; summary: string; start_date?: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [startDate, setStartDate] = useState("");

  useEffect(() => {
    if (week) {
      setTitle(week.title);
      setSummary(week.summary);
      setStartDate(week.start_date ?? "");
    }
  }, [week]);

  return (
    <Modal
      open={!!week}
      onClose={onClose}
      title={week ? `Week ${week.week_number}` : ""}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              onSave({
                title: title.trim(),
                summary: summary.trim(),
                start_date: startDate || undefined,
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Input
          label="Topic"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Cell division"
          autoFocus
        />
        <Textarea
          label="What's covered"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="Key concepts, readings, anything you'll study this week."
        />
        <Input
          label="Start date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
    </Modal>
  );
}
