import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Circle,
  NotePencil,
  Play,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  Button,
  Checkbox,
  EmptyState,
  GrowthRingsMotif,
  IconButton,
  Input,
  Modal,
  StatTile,
  Tree,
} from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { relativeDays } from "../../lib/date";
import { getAchievementTree } from "../../lib/achievementTree";
import type { Subject, Todo } from "../../lib/types";
import { SourcesPanel } from "../workspace/SourcesPanel";
import styles from "./OverviewScreen.module.css";

const SUBJECT_COLORS = ["#4A7C59", "#5A7D9A", "#C9A227", "#8A6BA3", "#B5524A", "#3F7E7C"];

/**
 * Subject page 1 of 3 — Overview: manage the subject (rename, colour, delete)
 * and its sources, see study progress for this week / last week / the whole
 * unit, work the week's todo list, and jump into studying. One primary action:
 * "Start studying".
 */
export function OverviewScreen() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const [reload, setReload] = useState(0);
  const subject = useAsync(() => api.getSubject(subjectId), [subjectId, reload]);
  const dash = useAsync(() => api.getSubjectDashboard(subjectId), [subjectId]);
  const review = useAsync(() => api.getReviewQueue(subjectId), [subjectId]);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (dash.status === "loading" || subject.status === "loading") {
    return <div className="page-wide">{<div className={styles.skeleton} aria-hidden="true" />}</div>;
  }
  if (dash.status === "error" || !dash.data || !subject.data) {
    return (
      <div className="page">
        <EmptyState
          title="Couldn't load this subject"
          description="Something went wrong reading local data."
          action={
            <Button variant="secondary" onClick={dash.retry}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const { tree: liveTree, stats, next_deadline, week_progress } = dash.data;
  const tree = getAchievementTree(subjectId, liveTree);
  const week = week_progress.current_week;
  const reviewCount = review.data?.length ?? 0;

  return (
    <div className="page-wide">
      <div className="screen-header">
        <h1>{subject.data.name}</h1>
        <div className={styles.headerActions}>
          <Button size="sm" variant="ghost" icon={<NotePencil />} onClick={() => setEditing(true)}>
            Edit subject
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash />} onClick={() => setDeleting(true)}>
            Delete
          </Button>
          <Button
            variant="primary"
            icon={<Play weight="fill" />}
            onClick={() => navigate(`/subject/${subjectId}/study`)}
          >
            Start studying
          </Button>
        </div>
      </div>

      {reviewCount > 0 && (
        <Link to={`/subject/${subjectId}/review`} className={styles.reviewBanner}>
          <span>
            <strong>{reviewCount} items</strong> waiting for review before they're saved.
          </span>
          <span className={styles.reviewCta}>
            Open review <ArrowRight weight="bold" />
          </span>
        </Link>
      )}

      {/* This week: what to learn now, or a clear CTA when empty. */}
      {week && (
        <section className={styles.weekNow} aria-label="This week">
          <div className={styles.weekNowText}>
            <h2 className={styles.weekNowTitle}>
              This week · Week {week.week_number}
              {week.title ? ` · ${week.title}` : ""}
            </h2>
            {week.source_count === 0 ? (
              <p className={styles.weekNowMuted}>
                No material for this week yet. Add this week's slides or readings below to study
                them.
              </p>
            ) : (
              week.summary && <p className={styles.weekNowMuted}>{week.summary}</p>
            )}
          </div>
          {week.source_count > 0 && (
            <Link to={`/subject/${subjectId}/study`} className={styles.weekNowCta}>
              Study this week
            </Link>
          )}
        </section>
      )}

      {/* Progress: this week vs last week vs the whole unit — neutral info. */}
      <div className={styles.grid}>
        <section className={styles.treePane} aria-label="Your progress tree">
          <Tree data={tree} seed={subjectId} size={300} />
        </section>

        <section className={styles.stats} aria-label="Study progress">
          <h2 className={styles.sectionTitle}>Progress</h2>
          <div className={styles.tiles}>
            <StatTile value={week_progress.reviews_this_week} label="Reviews this week" tone="muted" />
            <StatTile value={week_progress.reviews_last_week} label="Reviews last week" tone="muted" />
            <StatTile
              icon={<GrowthRingsMotif size={22} />}
              value={`${Math.round(tree.mastery_pct * 100)}%`}
              label="Unit mastery"
              tone="mastered"
            />
            <StatTile icon={<CheckCircle weight="fill" />} value={stats.mastered} label="Cards mastered" tone="mastered" />
            <StatTile icon={<Circle />} value={tree.concepts_learning} label="Cards learning" tone="learning" />
            <StatTile icon={<CalendarBlank />} value={stats.due_today} label="Due today" tone="muted" />
          </div>

          {next_deadline && (
            <div className={styles.deadline}>
              <span className={styles.deadlineLabel}>Upcoming deadline</span>
              <span className={styles.deadlineValue}>
                {next_deadline.title} · {relativeDays(next_deadline.due_at)}
              </span>
            </div>
          )}
        </section>
      </div>

      <SubjectTodos subjectId={subjectId} />

      <SourcesPanel subjectId={subjectId} />

      <EditSubjectModal
        open={editing}
        subject={subject.data}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          setReload((r) => r + 1);
        }}
      />
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete subject"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await api.deleteSubject(subjectId);
                navigate("/");
              }}
            >
              Delete subject
            </Button>
          </>
        }
      >
        <p>
          This removes <strong>{subject.data.name}</strong> with all its sources, cards, and
          schedule from this device. There is no undo.
        </p>
      </Modal>
    </div>
  );
}

/** The subject's open todos for the current study week, editable in place. */
function SubjectTodos({ subjectId }: { subjectId: string }) {
  const remote = useAsync(() => api.listTodos(), [subjectId]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (remote.status === "loaded") {
      setTodos(remote.data.filter((t) => t.subject_id === subjectId));
    }
  }, [remote.status, remote.data, subjectId]);

  async function add() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    const created = await api.createTodo({ subject_id: subjectId, title: trimmed });
    setTodos((prev) => [created, ...prev]);
  }

  function toggle(todo: Todo) {
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    api.setTodoDone(todo.id, !todo.done).catch(() =>
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: todo.done } : t))),
    );
  }

  function remove(todo: Todo) {
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    api.deleteTodo(todo.id).catch(() => setTodos((prev) => [...prev, todo]));
  }

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <section className={styles.todos} aria-label="This week's todos">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>This week's todos</h2>
      </div>

      <form
        className={styles.todoAdd}
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          placeholder="Add a todo for this subject…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="New todo"
        />
        <Button type="submit" size="sm" variant="secondary" icon={<Plus weight="bold" />} disabled={!title.trim()}>
          Add
        </Button>
      </form>

      {open.length === 0 && done.length === 0 ? (
        <p className={styles.todoEmpty}>Nothing on the list. Add what this week needs.</p>
      ) : (
        <ul className={styles.todoList}>
          {[...open, ...done].map((t) => (
            <li key={t.id} className={`${styles.todoItem} ${t.done ? styles.todoDone : ""}`}>
              <Checkbox label={t.title} checked={t.done} onChange={() => toggle(t)} />
              {t.due && <span className={styles.todoDue}>{relativeDays(t.due)}</span>}
              <IconButton size="sm" label={`Delete ${t.title}`} icon={<X />} onClick={() => remove(t)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EditSubjectModal({
  open,
  subject,
  onClose,
  onSaved,
}: {
  open: boolean;
  subject: Subject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(subject.name);
  const [color, setColor] = useState(subject.color);

  useEffect(() => {
    if (open) {
      setName(subject.name);
      setColor(subject.color);
    }
  }, [open, subject]);

  const valid = name.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit subject"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={async () => {
              await api.updateSubject(subject.id, { name: name.trim(), color });
              onSaved();
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className={styles.editForm}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <fieldset className={styles.colors}>
          <legend className={styles.colorsLegend}>Accent colour</legend>
          <div className={styles.colorRow}>
            {SUBJECT_COLORS.map((c) => (
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
      </div>
    </Modal>
  );
}
