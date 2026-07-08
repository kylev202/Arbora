import { useEffect, useState } from "react";
import { CalendarBlank, Exam, FileText, ListChecks, Plus, Sparkle, X } from "@phosphor-icons/react";
import { Button, EmptyState, IconButton, Input, Modal, RadioGroup, Tag } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { formatDate, relativeDays } from "../../lib/date";
import type { Deadline, DeadlineType } from "../../lib/types";
import { AssignmentBriefModal } from "./AssignmentBriefModal";
import { AssignmentDetailModal } from "./AssignmentDetailModal";
import { GradeTable } from "./GradeTable";
import styles from "./PlanScreen.module.css";

const DEADLINE_TYPES: { value: DeadlineType; label: string }[] = [
  { value: "exam", label: "Exam" },
  { value: "assignment", label: "Assignment" },
  { value: "other", label: "Other" },
];

/**
 * Deadlines panel (Plan page): create, delete, and work with deadlines —
 * grounded study briefs per assignment — plus the grade book. Day counts are
 * neutral, never red.
 */
export function DeadlinesPanel({ subjectId }: { subjectId: string }) {
  // Bump to refetch all after a create/delete (useAsync re-runs on deps).
  const [reload, setReload] = useState(0);
  const deadlines = useAsync(() => api.listDeadlines(subjectId), [subjectId, reload]);
  const grades = useAsync(() => api.listGrades(subjectId), [subjectId, reload]);
  const summary = useAsync(() => api.getGradeSummary(subjectId), [subjectId, reload]);
  const outline = useAsync(() => api.getOutline(subjectId), [subjectId, reload]);
  const briefs = useAsync(() => api.listAssignmentBriefs(subjectId), [subjectId, reload]);

  const [addingDeadline, setAddingDeadline] = useState(false);
  const [addingGrade, setAddingGrade] = useState(false);
  const [briefFor, setBriefFor] = useState<Deadline | null>(null);
  const [detailFor, setDetailFor] = useState<Deadline | null>(null);

  const refresh = () => setReload((r) => r + 1);

  const weeks = outline.data?.weeks ?? [];
  const briefByDeadline = new Map((briefs.data ?? []).map((b) => [b.deadline_id, b]));

  async function addDeadline(title: string, dueAt: string, type: DeadlineType) {
    await api.createDeadline(subjectId, title, dueAt, type);
    setAddingDeadline(false);
    refresh();
  }

  async function addGrade(grade: NewGrade) {
    await api.createGrade(subjectId, grade);
    setAddingGrade(false);
    refresh();
  }

  const deadlineList = deadlines.data ?? [];

  return (
    <>
      {/* ── Deadlines ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Deadlines</h2>
          <Button size="sm" icon={<Plus weight="bold" />} onClick={() => setAddingDeadline(true)}>
            Add deadline
          </Button>
        </div>

        {deadlineList.length === 0 ? (
          <EmptyState icon={<CalendarBlank />} title="No deadlines" description="Add exams or assignments to plan your reviews around them." />
        ) : (
          <ul className={styles.deadlines}>
            {deadlineList.map((d) => (
              <li key={d.id} className={styles.deadline}>
                <span className={styles.dlIcon} aria-hidden="true">
                  {d.type === "assignment" ? <FileText /> : <Exam />}
                </span>
                <span className={styles.dlTitle}>
                  {d.title}
                  {briefByDeadline.has(d.id) && (
                    <Tag tone="mastered">Brief ready</Tag>
                  )}
                </span>
                <span className={styles.dlDate}>{formatDate(d.due_at)}</span>
                <span className={styles.dlRel}>{relativeDays(d.due_at)}</span>
                <div className={styles.dlActions}>
                  {d.type === "assignment" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ListChecks weight="regular" />}
                      onClick={() => setDetailFor(d)}
                    >
                      Details
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Sparkle weight={briefByDeadline.has(d.id) ? "fill" : "regular"} />}
                    onClick={() => setBriefFor(d)}
                  >
                    Brief
                  </Button>
                  <IconButton
                    size="sm"
                    label={`Delete ${d.title}`}
                    icon={<X />}
                    onClick={() => api.deleteDeadline(d.id).then(refresh)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Grade book ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Grade book</h2>
          <Button size="sm" icon={<Plus weight="bold" />} onClick={() => setAddingGrade(true)}>
            Add grade
          </Button>
        </div>

        {grades.status === "loaded" && summary.status === "loaded" && grades.data.length > 0 ? (
          <GradeTable
            grades={grades.data}
            summary={summary.data}
            onDelete={(id) => api.deleteGrade(id).then(refresh)}
          />
        ) : (
          <EmptyState title="No grades yet" description="Add graded items to track your average and see what-if scenarios." />
        )}
      </section>

      <AddDeadlineModal open={addingDeadline} onClose={() => setAddingDeadline(false)} onAdd={addDeadline} />
      <AddGradeModal open={addingGrade} onClose={() => setAddingGrade(false)} onAdd={addGrade} />
      <AssignmentBriefModal
        open={!!briefFor}
        onClose={() => {
          setBriefFor(null);
          refresh();
        }}
        subjectId={subjectId}
        deadline={briefFor}
        weeks={weeks}
        brief={briefFor ? (briefByDeadline.get(briefFor.id) ?? null) : null}
      />
      <AssignmentDetailModal
        open={!!detailFor}
        onClose={() => {
          setDetailFor(null);
          refresh();
        }}
        subjectId={subjectId}
        deadline={detailFor}
      />
    </>
  );
}

function AddDeadlineModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (title: string, dueAt: string, type: DeadlineType) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<DeadlineType>("exam");

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate("");
      setType("exam");
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
            onClick={() => valid && onAdd(title.trim(), new Date(date).toISOString(), type)}
          >
            Add
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Input label="Title" placeholder="e.g. Midterm exam" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <Input label="Due date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <RadioGroup legend="Type" options={DEADLINE_TYPES} value={type} onChange={setType} />
      </div>
    </Modal>
  );
}

type NewGrade = { name: string; category: string; score: number | null; max_score: number; weight: number };

function AddGradeModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (grade: NewGrade) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [weight, setWeight] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setCategory("");
      setScore("");
      setMaxScore("100");
      setWeight("");
    }
  }, [open]);

  const maxNum = Number(maxScore);
  const valid = name.trim() && category.trim() && maxNum > 0;

  function submit() {
    if (!valid) return;
    onAdd({
      name: name.trim(),
      category: category.trim(),
      score: score.trim() === "" ? null : Number(score),
      max_score: maxNum,
      weight: weight.trim() === "" ? 0 : Number(weight) / 100, // UI percent → 0..1
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add grade"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>
            Add
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Input label="Name" placeholder="e.g. Midterm exam" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input label="Category" placeholder="e.g. Exam" value={category} onChange={(e) => setCategory(e.target.value)} />
        <div className={styles.gradeRow}>
          <Input label="Score" type="number" placeholder="leave blank if ungraded" value={score} onChange={(e) => setScore(e.target.value)} />
          <Input label="Out of" type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
          <Input label="Weight %" type="number" placeholder="0–100" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
