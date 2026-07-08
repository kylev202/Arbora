import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Tree as TreeIcon } from "@phosphor-icons/react";
import { Button, EmptyState, ForestTree, Input, Modal, type ForestBranchData } from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { getAchievementTree } from "../../lib/achievementTree";
import type { Subject } from "../../lib/types";
import { SubjectCard } from "./SubjectCard";
import { TodoPanel } from "./TodoPanel";
import styles from "./HomeScreen.module.css";

const SUBJECT_COLORS = ["#4A7C59", "#5A7D9A", "#C9A227", "#8A6BA3", "#B5524A", "#3F7E7C"];

/** Neutral time-of-day greeting — no streaks, no "you've been away" (§3.1). */
function greetingFor(name: string | null): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name} 🌱` : `${part} 🌱`;
}

/** S-01 — Home (redesign §3): greeting + the forest tree (one branch per
 * subject) + the todo panel, with the subject grid below. */
export function HomeScreen() {
  const navigate = useNavigate();
  const remote = useAsync(() => api.listSubjects(), []);
  const profile = useAsync(() => api.getProfile(), []);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [forest, setForest] = useState<ForestBranchData[] | null>(null);
  const [suggested, setSuggested] = useState<{ subject: Subject; due: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null);

  // Local mirror of the loaded list so a fresh create shows up immediately
  // without re-fetching.
  useEffect(() => {
    if (remote.status === "loaded") setSubjects(remote.data);
  }, [remote.status, remote.data]);

  // One branch per subject, fed by the same achievement-max data as the
  // per-subject dashboard tree (so the forest never shrinks either).
  useEffect(() => {
    let cancelled = false;
    if (subjects.length === 0) {
      setForest([]);
      return;
    }
    Promise.all(
      subjects.map(async (subject) => {
        const dash = await api.getSubjectDashboard(subject.id);
        return {
          subject,
          tree: getAchievementTree(subject.id, dash.tree),
          due: dash.stats.due_today,
        };
      }),
    )
      .then((branches) => {
        if (cancelled) return;
        setForest(branches);
        // One clear next step (§5.2): the subject with the most cards due.
        const top = branches.reduce(
          (best, b) => (b.due > (best?.due ?? 0) ? b : best),
          null as (typeof branches)[number] | null,
        );
        setSuggested(top && top.due > 0 ? { subject: top.subject, due: top.due } : null);
      })
      .catch(() => {
        if (!cancelled) setForest([]);
      });
    return () => {
      cancelled = true;
    };
  }, [subjects]);

  async function handleCreate(name: string) {
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    const created = await api.createSubject(name, color);
    setSubjects((prev) => [...prev, created]);
    setCreating(false);
    // Land on the timeline: import a syllabus or lay out the weeks (§4.1).
    navigate(`/subject/${created.id}/overview`);
  }

  const userName = profile.status === "loaded" ? profile.data.name : null;

  return (
    <div className={styles.screen}>
      <TopBar />
      <main className={styles.main}>
        <div className="page-wide">
          <h1 className={styles.greeting}>{greetingFor(userName)}</h1>

          <div className={styles.hero}>
            <section className={styles.treeSide} aria-label="Your progress tree">
              {subjects.length === 0 && remote.status === "loaded" ? (
                <EmptyState
                  icon={<TreeIcon weight="fill" />}
                  title="No subjects yet"
                  description="Start by adding your first subject, then drop in documents to grow it."
                  action={
                    <Button variant="primary" icon={<Plus weight="bold" />} onClick={() => setCreating(true)}>
                      New subject
                    </Button>
                  }
                />
              ) : (
                <>
                  <ForestTree
                    branches={forest ?? []}
                    onOpenSubject={(id) => navigate(`/subject/${id}`)}
                  />
                  {suggested && (
                    <Button
                      variant="primary"
                      icon={<ArrowRight weight="bold" />}
                      onClick={() => navigate(`/subject/${suggested.subject.id}/study`)}
                    >
                      Continue studying · {suggested.subject.name} ({suggested.due} due)
                    </Button>
                  )}
                </>
              )}
            </section>
            <aside className={styles.todoSide} aria-label="To do">
              <TodoPanel subjects={subjects} onCreateSubject={() => setCreating(true)} />
            </aside>
          </div>

          <hr className={styles.divider} />

          <div className="screen-header">
            <h2 className={styles.subjectsHeading}>Your subjects</h2>
            <div className={styles.headerActions}>
              {/* Secondary here: the screen's ONE primary is "Continue studying"
                  (the empty state carries its own primary when there's nothing). */}
              <Button variant="secondary" icon={<Plus weight="bold" />} onClick={() => setCreating(true)}>
                New subject
              </Button>
            </div>
          </div>

          {remote.status === "loading" && (
            <div className={styles.grid} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          )}

          {remote.status === "loaded" && subjects.length > 0 && (
            <div className={`${styles.grid} stagger`}>
              {subjects.map((s) => (
                <SubjectCard
                  key={s.id}
                  subject={s}
                  onEdit={() => setEditingSubject(s)}
                  onDelete={() => setDeletingSubject(s)}
                />
              ))}
            </div>
          )}

          {remote.status === "error" && (
            <EmptyState
              title="Couldn't load your subjects"
              description="Something went wrong reading local data."
              action={
                <Button variant="secondary" onClick={remote.retry}>
                  Try again
                </Button>
              }
            />
          )}
        </div>
      </main>

      <CreateSubjectModal open={creating} onClose={() => setCreating(false)} onCreate={handleCreate} />

      <EditSubjectModal
        subject={editingSubject}
        onClose={() => setEditingSubject(null)}
        onSaved={(updated) => {
          setSubjects((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          setEditingSubject(null);
        }}
      />

      <Modal
        open={deletingSubject !== null}
        onClose={() => setDeletingSubject(null)}
        title="Delete subject"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingSubject(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!deletingSubject) return;
                await api.deleteSubject(deletingSubject.id);
                setSubjects((prev) => prev.filter((s) => s.id !== deletingSubject.id));
                setDeletingSubject(null);
              }}
            >
              Delete subject
            </Button>
          </>
        }
      >
        {deletingSubject && (
          <p>
            This removes <strong>{deletingSubject.name}</strong> with all its sources, cards, and
            schedule from this device. There is no undo.
          </p>
        )}
      </Modal>
    </div>
  );
}

function CreateSubjectModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  function submit() {
    if (trimmed) onCreate(trimmed);
    setName("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New subject"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!trimmed}>
            Create
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          label="Subject name"
          placeholder="e.g. Biology 12"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </form>
    </Modal>
  );
}

/** Rename/recolour a subject from its ⋮ menu, without leaving Home. */
function EditSubjectModal({
  subject,
  onClose,
  onSaved,
}: {
  subject: Subject | null;
  onClose: () => void;
  onSaved: (updated: Subject) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");

  useEffect(() => {
    if (subject) {
      setName(subject.name);
      setColor(subject.color);
    }
  }, [subject]);

  const valid = name.trim().length > 0;

  return (
    <Modal
      open={subject !== null}
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
              if (!subject) return;
              const updated = await api.updateSubject(subject.id, { name: name.trim(), color });
              onSaved(updated);
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
