import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle, Circle, Plus, X } from "@phosphor-icons/react";
import { Button, Checkbox, IconButton, Input } from "../../components";
import { api } from "../../lib/api";
import type { Subject, Todo } from "../../lib/types";
import styles from "./TodoPanel.module.css";

type SetupItem = {
  key: string;
  label: string;
  done: boolean;
  go: () => void;
};

/**
 * Home todo panel (redesign §3.3). Two phases: a setup checklist computed from
 * real data (nothing to keep in sync) while the app is still being configured,
 * then the todo list itself. Deferring or skipping is always neutral — no red,
 * no overdue badges (a11y-adhd).
 */
export function TodoPanel({
  subjects,
  onCreateSubject,
}: {
  subjects: Subject[];
  onCreateSubject: () => void;
}) {
  const navigate = useNavigate();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState("");
  const [hasWindows, setHasWindows] = useState<boolean | null>(null);
  const [hasEvents, setHasEvents] = useState<boolean | null>(null);
  const [hasSources, setHasSources] = useState<boolean | null>(null);

  useEffect(() => {
    api.listTodos().then(setTodos).catch(() => {});
    api.listStudyWindows().then((w) => setHasWindows(w.length > 0)).catch(() => setHasWindows(null));
    api.listEvents().then((e) => setHasEvents(e.length > 0)).catch(() => setHasEvents(null));
  }, []);

  // Any subject with at least one source counts as "material added".
  useEffect(() => {
    if (subjects.length === 0) {
      setHasSources(false);
      return;
    }
    let cancelled = false;
    Promise.all(subjects.map((s) => api.listSources(s.id)))
      .then((lists) => {
        if (!cancelled) setHasSources(lists.some((l) => l.length > 0));
      })
      .catch(() => setHasSources(null));
    return () => {
      cancelled = true;
    };
  }, [subjects]);

  const setup: SetupItem[] = [
    {
      key: "subjects",
      label: "Add your subjects",
      done: subjects.length > 0,
      go: onCreateSubject,
    },
    {
      key: "windows",
      label: "Set your weekly study windows",
      done: hasWindows === true,
      go: () => navigate("/settings"),
    },
    {
      key: "events",
      label: "Put your timetable on the calendar",
      done: hasEvents === true,
      go: () => navigate("/calendar"),
    },
    {
      key: "sources",
      label: "Add study material to a subject",
      done: hasSources === true,
      go: () =>
        subjects.length > 0 ? navigate(`/subject/${subjects[0].id}/sources`) : onCreateSubject(),
    },
  ];
  const setupDone = setup.every((s) => s.done);

  async function addTodo() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const created = await api.createTodo({ title });
    setTodos((prev) => [...prev, created]);
  }

  async function toggle(todo: Todo) {
    const updated = await api.setTodoDone(todo.id, !todo.done);
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
  }

  async function remove(id: string) {
    await api.deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name;

  return (
    <div className={styles.panel}>
      {!setupDone && (
        <section>
          <h2 className={styles.heading}>Getting set up</h2>
          <ul className={styles.setupList}>
            {setup.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={`${styles.setupItem} ${item.done ? styles.setupDone : ""}`}
                  onClick={item.go}
                  disabled={item.done}
                >
                  {item.done ? (
                    <CheckCircle weight="fill" className={styles.setupIconDone} aria-hidden="true" />
                  ) : (
                    <Circle className={styles.setupIcon} aria-hidden="true" />
                  )}
                  <span className={styles.setupLabel}>{item.label}</span>
                  {!item.done && <ArrowRight className={styles.setupGo} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className={styles.heading}>To do</h2>
        {todos.length === 0 && (
          <p className={styles.empty}>
            {setupDone
              ? "Nothing on the list. Add a task, or let the scheduler suggest sessions."
              : "Your tasks will live here."}
          </p>
        )}
        <ul className={styles.todoList}>
          {todos.map((t) => (
            <li key={t.id} className={`${styles.todo} ${t.done ? styles.todoDone : ""}`}>
              <Checkbox
                label={t.title}
                checked={t.done}
                onChange={() => void toggle(t)}
              />
              <span className={styles.todoMeta}>
                {subjectName(t.subject_id)}
                {t.due ? ` · ${t.due.split("T")[0]}` : ""}
              </span>
              <IconButton label={`Remove ${t.title}`} icon={<X />} size="sm" onClick={() => void remove(t.id)} />
            </li>
          ))}
        </ul>
        <form
          className={styles.addRow}
          onSubmit={(e) => {
            e.preventDefault();
            void addTodo();
          }}
        >
          <Input
            label="New task"
            placeholder="Add a task…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" variant="secondary" icon={<Plus />} disabled={!draft.trim()}>
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}
