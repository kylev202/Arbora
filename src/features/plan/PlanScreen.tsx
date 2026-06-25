import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarBlank, Exam, FileText, Plus } from "@phosphor-icons/react";
import { Button, EmptyState, Input, Modal } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { mockApi } from "../../mocks/api";
import { formatDate, relativeDays } from "../../lib/date";
import type { Deadline, DeadlineType } from "../../lib/types";
import { GradeTable } from "./GradeTable";
import styles from "./PlanScreen.module.css";

/** S-07 — Plan: deadlines + grade book. Day counts are neutral, never red. */
export function PlanScreen() {
  const { subjectId = "" } = useParams();
  const remoteDeadlines = useAsync(() => mockApi.listDeadlines(subjectId), [subjectId]);
  const grades = useAsync(() => mockApi.listGrades(subjectId), [subjectId]);
  const summary = useAsync(() => mockApi.getGradeSummary(subjectId), [subjectId]);

  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (remoteDeadlines.status === "loaded") setDeadlines(remoteDeadlines.data);
  }, [remoteDeadlines.status, remoteDeadlines.data]);

  function addDeadline(title: string, dueAt: string) {
    setDeadlines((prev) =>
      [...prev, { id: crypto.randomUUID(), subject_id: subjectId, title, due_at: dueAt, type: "other" as DeadlineType }].sort(
        (a, b) => a.due_at.localeCompare(b.due_at),
      ),
    );
    setAdding(false);
  }

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Plan</h1>
      </div>

      {/* ── Deadlines ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Deadlines</h2>
          <Button size="sm" icon={<Plus weight="bold" />} onClick={() => setAdding(true)}>
            Add deadline
          </Button>
        </div>

        {deadlines.length === 0 ? (
          <EmptyState icon={<CalendarBlank />} title="No deadlines" description="Add exams or assignments to plan your reviews around them." />
        ) : (
          <ul className={styles.deadlines}>
            {deadlines.map((d) => (
              <li key={d.id} className={styles.deadline}>
                <span className={styles.dlIcon} aria-hidden="true">
                  {d.type === "assignment" ? <FileText /> : <Exam />}
                </span>
                <span className={styles.dlTitle}>{d.title}</span>
                <span className={styles.dlDate}>{formatDate(d.due_at)}</span>
                <span className={styles.dlRel}>{relativeDays(d.due_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Grade book ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Grade book</h2>
        </div>

        {grades.status === "loaded" && summary.status === "loaded" && grades.data.length > 0 ? (
          <GradeTable grades={grades.data} summary={summary.data} />
        ) : (
          <EmptyState title="No grades yet" description="Add graded items to track your average and see what-if GPA scenarios." />
        )}
      </section>

      <AddDeadlineModal open={adding} onClose={() => setAdding(false)} onAdd={addDeadline} />
    </div>
  );
}

function AddDeadlineModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (title: string, dueAt: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate("");
    }
  }, [open]);

  const valid = title.trim() && date;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add deadline"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => valid && onAdd(title.trim(), new Date(date).toISOString())}
          >
            Add
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Input label="Title" placeholder="e.g. Midterm exam" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <Input label="Due date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
    </Modal>
  );
}
