import { useEffect, useState } from "react";
import { Button, Checkbox, DatePicker, Input, Modal, Select, TimePicker } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { CalendarEvent, EventKind } from "../../lib/types";
import styles from "./EventModal.module.css";

const KINDS: { value: EventKind; label: string }[] = [
  { value: "study", label: "Study session" },
  { value: "lecture", label: "Lecture" },
  { value: "class", label: "Class" },
  { value: "deadline", label: "Deadline" },
  { value: "custom", label: "Other" },
];

const EVENT_COLORS = ["#4A7C59", "#5A7D9A", "#C9A227", "#8A6BA3", "#B5524A", "#3F7E7C"];

type RepeatFreq = "daily" | "weekly" | "monthly";

function expandDates(startDate: string, freq: RepeatFreq, until: string): string[] {
  const [y, m, d] = startDate.split("-").map(Number);
  const end = new Date(until + "T23:59:59");
  const dates: string[] = [];
  let cur = new Date(y, m - 1, d);
  while (cur <= end && dates.length < 100) {
    const yy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    dates.push(`${yy}-${mm}-${dd}`);
    if (freq === "daily") cur.setDate(cur.getDate() + 1);
    else if (freq === "weekly") cur.setDate(cur.getDate() + 7);
    else cur.setMonth(cur.getMonth() + 1);
  }
  return dates;
}

export type EventDraft = { date: string; start: string; end: string };

/** Create/edit one timetable event. `event` set = edit mode (adds status +
 * delete); otherwise creates at the clicked slot in `draft`. */
export function EventModal({
  open,
  event,
  draft,
  onClose,
  onSaved,
  onDeleted,
  onGroupDeleted,
}: {
  open: boolean;
  event: CalendarEvent | null;
  draft: EventDraft | null;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: (id: string) => void;
  onGroupDeleted?: (groupId: string) => void;
}) {
  const subjects = useAsync(() => api.listSubjects(), []);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [kind, setKind] = useState<EventKind>("study");
  const [kindLabel, setKindLabel] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("19:00");
  const [done, setDone] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState<RepeatFreq>("weekly");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [error, setError] = useState("");

  // Adopt the event being edited / the clicked slot each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setError("");
    if (event) {
      setTitle(event.title);
      setSubjectId(event.subject_id ?? "");
      setKind(event.kind);
      setKindLabel(event.kind_label ?? "");
      setColor(event.color);
      setDate(event.start_at.split("T")[0]);
      setStart(event.start_at.split("T")[1]);
      setEnd(event.end_at.split("T")[1]);
      setDone(event.status === "done");
    } else if (draft) {
      setTitle("");
      setSubjectId("");
      setKind("study");
      setKindLabel("");
      setColor(null);
      setDate(draft.date);
      setStart(draft.start);
      setEnd(draft.end);
      setDone(false);
      setRepeat(false);
      setRepeatFreq("weekly");
      setRepeatUntil("");
    }
  }, [open, event, draft]);

  async function save() {
    try {
      const kindLabelValue = kind === "custom" ? kindLabel || null : null;

      if (!event && repeat) {
        if (!repeatUntil || repeatUntil < date) {
          setError("Set a repeat end date on or after the event date.");
          return;
        }
        const groupId = crypto.randomUUID();
        const dates = expandDates(date, repeatFreq, repeatUntil);
        for (const d of dates) {
          const saved = await api.upsertEvent({
            subject_id: subjectId || null,
            title,
            start_at: `${d}T${start}`,
            end_at: `${d}T${end}`,
            kind,
            kind_label: kindLabelValue,
            color,
            recurrence_group_id: groupId,
          });
          onSaved(saved);
        }
        onClose();
      } else {
        const saved = await api.upsertEvent({
          id: event?.id,
          subject_id: subjectId || null,
          title,
          start_at: `${date}T${start}`,
          end_at: `${date}T${end}`,
          kind,
          kind_label: kindLabelValue,
          color,
          status: event ? (done ? "done" : "planned") : undefined,
        });
        onSaved(saved);
        onClose();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeSingle() {
    if (!event) return;
    await api.deleteEvent(event.id);
    onDeleted(event.id);
    onClose();
  }

  async function removeGroup() {
    if (!event?.recurrence_group_id) return;
    await api.deleteEventGroup(event.recurrence_group_id);
    onGroupDeleted?.(event.recurrence_group_id);
    onClose();
  }

  const isGrouped = Boolean(event?.recurrence_group_id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? "Edit event" : "New event"}
      size="sm"
      footer={
        <div className={styles.footer}>
          {event ? (
            isGrouped ? (
              <div className={styles.deleteGroup}>
                <Button variant="danger" size="sm" onClick={() => void removeSingle()}>
                  Delete this
                </Button>
                <Button variant="danger" size="sm" onClick={() => void removeGroup()}>
                  Delete all
                </Button>
              </div>
            ) : (
              <Button variant="danger" onClick={() => void removeSingle()}>
                Delete event
              </Button>
            )
          ) : (
            <span />
          )}
          <div className={styles.footerRight}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={!title.trim()}>
              {event ? "Save changes" : "Add to calendar"}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.form}>
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder="e.g. Review week 3"
        />
        <div className={styles.pair}>
          <Select
            label="Subject"
            value={subjectId}
            placeholder="None"
            onChange={setSubjectId}
            options={[
              { value: "", label: "None" },
              ...(subjects.status === "loaded"
                ? subjects.data.map((s) => ({ value: s.id, label: s.name }))
                : []),
            ]}
          />
          <Select
            label="Type"
            value={kind}
            onChange={(v) => setKind(v as EventKind)}
            options={KINDS}
          />
        </div>
        {kind === "custom" && (
          <Input
            label="Describe type"
            value={kindLabel}
            onChange={(e) => setKindLabel(e.target.value)}
            placeholder="e.g. Office hours, Club meeting…"
          />
        )}
        <fieldset className={styles.colors}>
          <legend className={styles.colorsLegend}>Colour</legend>
          <div className={styles.colorRow}>
            <button
              type="button"
              className={`${styles.colorSwatch} ${styles.colorDefault} ${color === null ? styles.colorActive : ""}`}
              aria-label="Default (colour by type)"
              aria-pressed={color === null}
              onClick={() => setColor(null)}
            />
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.colorSwatch} ${c === color ? styles.colorActive : ""}`}
                style={{ backgroundColor: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>
        <DatePicker label="Date" value={date} onChange={setDate} />
        <div className={styles.pair}>
          <TimePicker label="From" value={start} onChange={setStart} />
          <TimePicker label="Until" value={end} onChange={setEnd} />
        </div>
        {!event && (
          <>
            <Checkbox
              label="Repeat"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
            />
            {repeat && (
              <div className={styles.repeatFields}>
                <Select
                  label="Frequency"
                  value={repeatFreq}
                  onChange={(v) => setRepeatFreq(v as RepeatFreq)}
                  options={[
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                  ]}
                />
                <DatePicker
                  label="Repeat until"
                  value={repeatUntil}
                  onChange={setRepeatUntil}
                  min={date}
                />
              </div>
            )}
          </>
        )}
        {event && (
          <Checkbox label="Done" checked={done} onChange={(e) => setDone(e.target.checked)} />
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error.includes("end after") ? "The event should end after it starts." : error}
          </p>
        )}
      </div>
    </Modal>
  );
}
