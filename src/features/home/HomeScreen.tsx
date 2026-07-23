import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ArrowRight, FileArrowUp, Plus, Tree as TreeIcon, UploadSimple, X } from "@phosphor-icons/react";
import {
  Button,
  DatePicker,
  EmptyState,
  ForestTree,
  IconButton,
  Input,
  Modal,
  RadioGroup,
  type ForestBranchData,
} from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { getAchievementTree } from "../../lib/achievementTree";
import { DISCIPLINES, type Discipline, type Subject } from "../../lib/types";
import { ImportSyllabusModal } from "../outline/ImportSyllabusModal";
import { SubjectCard } from "./SubjectCard";
import { TodoPanel } from "./TodoPanel";
import styles from "./HomeScreen.module.css";

const SUBJECT_COLORS = ["#4A7C59", "#5A7D9A", "#C9A227", "#8A6BA3", "#B5524A", "#3F7E7C"];

/** File types the new-subject syllabus picker accepts — mirrors ImportSyllabusModal. */
const SYLLABUS_FILTERS = [
  { name: "Syllabus", extensions: ["pdf", "docx", "pptx", "ppt", "txt", "md", "markdown"] },
];

/** Term length in weeks from a start/end date pair, matching the outline's week
 *  derivation (week N starts term_start + (N-1)*7 days). Falls back to a 12-week
 *  term when only a start date is given; clamped to the 1..53 outline bounds. */
function weeksBetween(start: string, end: string | null): number {
  if (!end) return 12;
  const DAY = 86_400_000;
  const diffDays = Math.floor((Date.parse(end) - Date.parse(start)) / DAY);
  return Math.min(53, Math.max(1, Math.floor(diffDays / 7) + 1));
}

/** Discipline picker options — mirrors `DISCIPLINES`, shaped for `RadioGroup`. */
const DISCIPLINE_OPTIONS = DISCIPLINES.map((d) => ({
  value: d.value,
  label: d.label,
  description: d.hint,
}));

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
  // When a new subject is created with a syllabus, hand the chosen file to the
  // review-before-trust import flow (staying on Home) before landing on it.
  const [importSubject, setImportSubject] = useState<Subject | null>(null);
  const [importFile, setImportFile] = useState<string | null>(null);

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

  async function handleCreate(opts: {
    name: string;
    syllabusPath: string | null;
    startDate: string | null;
    endDate: string | null;
  }) {
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    // Discipline defaults to 'general' server-side; it's set later via Edit.
    const created = await api.createSubject(opts.name, color);
    setSubjects((prev) => [...prev, created]);
    setCreating(false);
    if (opts.syllabusPath) {
      // Review-before-trust: parse + review the syllabus, then land on the subject.
      setImportFile(opts.syllabusPath);
      setImportSubject(created);
      return;
    }
    // No syllabus: persist the term straight from the start/end dates entered.
    if (opts.startDate) {
      await api.setOutline(created.id, opts.startDate, weeksBetween(opts.startDate, opts.endDate));
    }
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

      <ImportSyllabusModal
        open={importSubject !== null}
        subjectId={importSubject?.id ?? ""}
        initialFilePath={importFile ?? undefined}
        onClose={() => {
          const s = importSubject;
          setImportSubject(null);
          setImportFile(null);
          // The subject exists whether or not the outline was committed — land on it.
          if (s) navigate(`/subject/${s.id}/overview`);
        }}
        onCommitted={() => {}}
      />

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
  onCreate: (opts: {
    name: string;
    syllabusPath: string | null;
    startDate: string | null;
    endDate: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [syllabusPath, setSyllabusPath] = useState<string | null>(null);
  const [syllabusName, setSyllabusName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const trimmed = name.trim();
  // ISO date strings sort lexicographically, so a string compare orders them.
  const datesValid = !endDate || (!!startDate && endDate >= startDate);
  const canCreate = !!trimmed && (syllabusPath !== null || datesValid);

  function reset() {
    setName("");
    setSyllabusPath(null);
    setSyllabusName("");
    setStartDate("");
    setEndDate("");
  }

  function close() {
    reset();
    onClose();
  }

  async function chooseSyllabus() {
    const selected = await openDialog({ multiple: false, filters: SYLLABUS_FILTERS });
    if (typeof selected !== "string") return; // cancelled
    setSyllabusPath(selected);
    setSyllabusName(selected.split(/[\\/]/).pop() ?? selected);
  }

  function submit() {
    if (!canCreate) return;
    // A syllabus supplies the term structure, so the manual dates are ignored.
    onCreate({
      name: trimmed,
      syllabusPath,
      startDate: syllabusPath ? null : startDate || null,
      endDate: syllabusPath ? null : endDate || null,
    });
    reset();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New subject"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canCreate}>
            Create
          </Button>
        </>
      }
    >
      <form
        className={styles.editForm}
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

        {syllabusPath ? (
          <div className={styles.syllabusChosen}>
            <FileArrowUp weight="fill" aria-hidden="true" />
            <span className={styles.syllabusName}>{syllabusName}</span>
            <IconButton
              label="Remove syllabus"
              icon={<X />}
              size="sm"
              onClick={() => {
                setSyllabusPath(null);
                setSyllabusName("");
              }}
            />
          </div>
        ) : (
          <>
            <div className={styles.dateRow}>
              <DatePicker
                label="Start date"
                value={startDate}
                onChange={setStartDate}
                placeholder="dd/mm/yyyy"
              />
              <DatePicker
                label="End date"
                value={endDate}
                onChange={setEndDate}
                min={startDate || undefined}
                placeholder="dd/mm/yyyy"
              />
            </div>
            <p className={styles.syllabusHint}>
              Have a unit syllabus? Upload it and Arbora reads your weeks and deadlines from it — no
              need to add it again later.
            </p>
            <Button
              type="button"
              variant="secondary"
              icon={<UploadSimple weight="bold" />}
              onClick={chooseSyllabus}
            >
              Upload syllabus
            </Button>
          </>
        )}
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
  const [discipline, setDiscipline] = useState<Discipline>("general");

  useEffect(() => {
    if (subject) {
      setName(subject.name);
      setColor(subject.color);
      setDiscipline(subject.discipline);
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
              const updated = await api.updateSubject(subject.id, {
                name: name.trim(),
                color,
                discipline,
              });
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
        <RadioGroup
          legend="Subject type"
          options={DISCIPLINE_OPTIONS}
          value={discipline}
          onChange={setDiscipline}
        />
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
