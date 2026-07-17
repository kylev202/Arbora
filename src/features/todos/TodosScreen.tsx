import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Circle,
  ListChecks,
  Plus,
  Sparkle,
  Sun,
  Trash,
  X,
} from "@phosphor-icons/react";
import { Button, Checkbox, DatePicker, EmptyState, IconButton, Input, Select, Textarea, TimePicker } from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { Subject, Todo, TodoRepeat } from "../../lib/types";
import styles from "./TodosScreen.module.css";

/** Local YYYY-MM-DD for "today" (no UTC shift — due dates are wall-clock). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A smart list (All / Today / AI suggestions) or one per subject. */
type ListKey = "all" | "today" | "ai" | `subject:${string}`;

const REPEAT_OPTIONS: { value: "" | TodoRepeat; label: string }[] = [
  { value: "", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

/**
 * Dedicated Todos manager (Microsoft To-Do shape): a left rail of lists, a task
 * list, and a detail pane. It reads the SAME `listTodos` store as the home panel
 * and per-subject todos, so every surface stays in sync automatically. AI-
 * suggested todos surface in their own list but stay freely editable (law #2);
 * setting a due date mirrors the task onto the calendar (handled by the core).
 */
export function TodosScreen() {
  const subjectsReq = useAsync(() => api.listSubjects(), []);
  const subjects: Subject[] = subjectsReq.data ?? [];

  const [todos, setTodos] = useState<Todo[]>([]);
  const [list, setList] = useState<ListKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    api.listTodos().then(setTodos).catch(() => {});
  }, []);

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name;

  const lists: { key: ListKey; label: string; icon: typeof ListChecks; count: number }[] = useMemo(() => {
    const open = (t: Todo) => !t.done;
    const today = todayISO();
    const base = [
      { key: "all" as ListKey, label: "All tasks", icon: ListChecks, count: todos.filter(open).length },
      {
        key: "today" as ListKey,
        label: "Today",
        icon: Sun,
        count: todos.filter((t) => open(t) && t.due?.slice(0, 10) === today).length,
      },
      {
        key: "ai" as ListKey,
        label: "AI suggestions",
        icon: Sparkle,
        count: todos.filter((t) => open(t) && t.source === "ai").length,
      },
    ];
    const perSubject = subjects.map((s) => ({
      key: `subject:${s.id}` as ListKey,
      label: s.name,
      icon: Circle,
      count: todos.filter((t) => open(t) && t.subject_id === s.id).length,
    }));
    return [...base, ...perSubject];
  }, [todos, subjects]);

  const visible = useMemo(() => {
    const today = todayISO();
    return todos.filter((t) => {
      if (list === "all") return true;
      if (list === "today") return t.due?.slice(0, 10) === today;
      if (list === "ai") return t.source === "ai";
      return t.subject_id === list.slice("subject:".length);
    });
  }, [todos, list]);

  const selected = todos.find((t) => t.id === selectedId) ?? null;
  const canAdd = list !== "ai";

  function merge(updated: Todo) {
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function addTodo() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const subject_id = list.startsWith("subject:") ? list.slice("subject:".length) : null;
    const due = list === "today" ? todayISO() : null;
    const created = await api.createTodo({ subject_id, title, due });
    setTodos((prev) => [created, ...prev]);
    // Detail opens only when the user explicitly clicks a task — not on create.
  }

  async function toggle(t: Todo) {
    const updated = await api.setTodoDone(t.id, !t.done);
    merge(updated);
    // A completed repeat spawns a fresh occurrence server-side — reload to show it.
    if (!t.done && t.repeat) api.listTodos().then(setTodos).catch(() => {});
  }

  async function remove(id: string) {
    await api.deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function patch(fields: Partial<Pick<Todo, "title" | "notes" | "due" | "repeat" | "subject_id">>) {
    if (!selected) return;
    const next = { ...selected, ...fields };
    const updated = await api.updateTodo({
      id: next.id,
      subject_id: next.subject_id,
      title: next.title,
      notes: next.notes,
      due: next.due,
      repeat: next.repeat,
    });
    merge(updated);
  }

  // A due date is stored as "YYYY-MM-DD" (all-day) or "YYYY-MM-DDTHH:MM" (timed);
  // either way the core mirrors it onto the calendar. These keep the date, the
  // all-day toggle, and the time in sync on the single `due` string.
  const dueDate = selected?.due?.slice(0, 10) ?? "";
  const dueTime = selected && selected.due && selected.due.length > 10 ? selected.due.slice(11, 16) : "";

  function setDueDate(date: string) {
    void patch({ due: date ? (dueTime ? `${date}T${dueTime}` : date) : null });
  }
  function setDueAllDay(allDay: boolean) {
    if (!dueDate) return;
    void patch({ due: allDay ? dueDate : `${dueDate}T09:00` });
  }
  function setDueTime(time: string) {
    if (!dueDate) return;
    void patch({ due: `${dueDate}T${time}` });
  }

  return (
    <div className={styles.screen}>
      <TopBar />
      <main className={styles.main}>
        <div className="page-wide">
          <div className="screen-header">
            <h1 className={styles.heading}>Tasks</h1>
          </div>

          <div className={styles.board}>
            {/* ── Left rail: lists ── */}
            <nav className={`${styles.rail} glass`} aria-label="Task lists">
              {lists.map(({ key, label, icon: Icon, count }) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.railItem} ${list === key ? styles.railActive : ""}`}
                  onClick={() => setList(key)}
                  aria-current={list === key ? "true" : undefined}
                >
                  <Icon className={styles.railIcon} aria-hidden="true" weight="regular" />
                  <span className={styles.railLabel}>{label}</span>
                  {count > 0 && <span className={styles.railCount}>{count}</span>}
                </button>
              ))}
            </nav>

            {/* ── Middle: task list ── */}
            <section className={`${styles.listPane} glass`} aria-label="Tasks">
              {canAdd && (
                <form
                  className={styles.addRow}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addTodo();
                  }}
                >
                  <Input
                    aria-label="New task"
                    placeholder="Add a task…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <Button type="submit" variant="secondary" icon={<Plus />} disabled={!draft.trim()}>
                    Add
                  </Button>
                </form>
              )}

              {visible.length === 0 ? (
                <EmptyState
                  icon={<ListChecks weight="fill" />}
                  title={
                    list === "ai"
                      ? "No suggestions yet"
                      : list === "today"
                        ? "Nothing due today"
                        : "No tasks yet"
                  }
                  description={
                    list === "ai"
                      ? "When the planner spots something worth doing, it lands here for you to accept or skip."
                      : list === "today"
                        ? "A clear day. Anything you add with a due date of today shows up here."
                        : "Add a task above — small ones count."
                  }
                />
              ) : (
                <ul className={styles.todoList}>
                  {visible.map((t) => (
                    <li
                      key={t.id}
                      className={`${styles.todo} ${t.done ? styles.done : ""} ${t.id === selectedId ? styles.selected : ""}`}
                    >
                      <button
                        type="button"
                        className={styles.check}
                        onClick={() => void toggle(t)}
                        aria-label={t.done ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
                      >
                        {t.done ? (
                          <CheckCircle weight="fill" className={styles.checkDone} aria-hidden="true" />
                        ) : (
                          <Circle className={styles.checkOpen} aria-hidden="true" />
                        )}
                      </button>
                      <button type="button" className={styles.todoBody} onClick={() => setSelectedId(t.id)}>
                        <span className={styles.todoTitle}>{t.title}</span>
                        <span className={styles.todoMeta}>
                          {t.source === "ai" && <span className={styles.aiTag}>Suggested</span>}
                          {subjectName(t.subject_id)}
                          {t.due ? ` · ${t.due.slice(0, 10)}` : ""}
                          {t.repeat ? " · repeats" : ""}
                        </span>
                      </button>
                      <IconButton
                        label={`Remove ${t.title}`}
                        icon={<Trash />}
                        size="sm"
                        onClick={() => void remove(t.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Right: detail pane ── */}
            {selected && (
              <aside className={`${styles.detail} glass`} aria-label="Task details">
                <div className={styles.detailHead}>
                  <h2 className={styles.detailHeading}>Details</h2>
                  <IconButton label="Close details" icon={<X />} size="sm" onClick={() => setSelectedId(null)} />
                </div>
                <Input
                  label="Title"
                  value={selected.title}
                  onChange={(e) => merge({ ...selected, title: e.target.value })}
                  onBlur={(e) => void patch({ title: e.target.value.trim() || selected.title })}
                />
                <Textarea
                  label="Notes"
                  rows={5}
                  placeholder="Add notes…"
                  value={selected.notes ?? ""}
                  onChange={(e) => merge({ ...selected, notes: e.target.value })}
                  onBlur={(e) => void patch({ notes: e.target.value || null })}
                />
                <DatePicker label="Due date" value={dueDate} onChange={setDueDate} />
                {dueDate && (
                  <>
                    <Checkbox
                      label="All day"
                      checked={!dueTime}
                      onChange={(e) => setDueAllDay(e.target.checked)}
                    />
                    {dueTime && <TimePicker label="Due time" value={dueTime} onChange={setDueTime} />}
                    <p className={styles.hint}>Added to your calendar as a deadline.</p>
                  </>
                )}
                <Select
                  label="Repeat"
                  value={selected.repeat ?? ""}
                  options={REPEAT_OPTIONS}
                  onChange={(v) => void patch({ repeat: (v || null) as TodoRepeat | null })}
                />
                <Select
                  label="Subject"
                  value={selected.subject_id ?? ""}
                  placeholder="No subject"
                  options={[{ value: "", label: "No subject" }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
                  onChange={(v) => void patch({ subject_id: v || null })}
                />
              </aside>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
