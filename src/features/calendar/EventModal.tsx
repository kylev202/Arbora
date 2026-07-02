import { useEffect, useState } from "react";
import { Button, Input, Modal } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { CalendarEvent, EventKind } from "../../lib/types";
import styles from "./EventModal.module.css";

const KINDS: { value: EventKind; label: string }[] = [
  { value: "study", label: "Study session" },
  { value: "lecture", label: "Lecture" },
  { value: "deadline", label: "Deadline" },
  { value: "custom", label: "Other" },
];

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
}: {
  open: boolean;
  event: CalendarEvent | null;
  draft: EventDraft | null;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: (id: string) => void;
}) {
  const subjects = useAsync(() => api.listSubjects(), []);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [kind, setKind] = useState<EventKind>("study");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("19:00");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Adopt the event being edited / the clicked slot each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setError("");
    if (event) {
      setTitle(event.title);
      setSubjectId(event.subject_id ?? "");
      setKind(event.kind);
      setDate(event.start_at.split("T")[0]);
      setStart(event.start_at.split("T")[1]);
      setEnd(event.end_at.split("T")[1]);
      setDone(event.status === "done");
    } else if (draft) {
      setTitle("");
      setSubjectId("");
      setKind("study");
      setDate(draft.date);
      setStart(draft.start);
      setEnd(draft.end);
      setDone(false);
    }
  }, [open, event, draft]);

  async function save() {
    try {
      const saved = await api.upsertEvent({
        id: event?.id,
        subject_id: subjectId || null,
        title,
        start_at: `${date}T${start}`,
        end_at: `${date}T${end}`,
        kind,
        status: event ? (done ? "done" : "planned") : undefined,
      });
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove() {
    if (!event) return;
    await api.deleteEvent(event.id);
    onDeleted(event.id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? "Edit event" : "New event"}
      size="sm"
      footer={
        <div className={styles.footer}>
          {event ? (
            <Button variant="danger" onClick={() => void remove()}>
              Delete event
            </Button>
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
          <label className={styles.field}>
            <span className={styles.label}>Subject</span>
            <select
              className={styles.select}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">None</option>
              {subjects.status === "loaded" &&
                subjects.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Type</span>
            <select
              className={styles.select}
              value={kind}
              onChange={(e) => setKind(e.target.value as EventKind)}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className={styles.pair}>
          <Input label="From" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Until" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        {event && (
          <label className={styles.doneRow}>
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            <span>Done</span>
          </label>
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
