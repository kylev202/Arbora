import { useEffect, useState } from "react";
import { Plus, Tree as TreeIcon } from "@phosphor-icons/react";
import { Button, EmptyState, Input, Modal } from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { Subject } from "../../lib/types";
import { SubjectCard } from "./SubjectCard";
import styles from "./HomeScreen.module.css";

const SUBJECT_COLORS = ["#4A7C59", "#5A7D9A", "#C9A227", "#8A6BA3", "#B5524A", "#3F7E7C"];

/** S-01 — Home / subject list. The entry point; one primary: + New subject. */
export function HomeScreen() {
  const remote = useAsync(() => api.listSubjects(), []);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [creating, setCreating] = useState(false);

  // Local mirror of the loaded list so a fresh create shows up immediately
  // without re-fetching.
  useEffect(() => {
    if (remote.status === "loaded") setSubjects(remote.data);
  }, [remote.status, remote.data]);

  async function handleCreate(name: string) {
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    const created = await api.createSubject(name, color);
    setSubjects((prev) => [...prev, created]);
    setCreating(false);
  }

  return (
    <div className={styles.screen}>
      <TopBar />
      <main className={styles.main}>
        <div className="page-wide">
          <div className="screen-header">
            <h1>Your subjects</h1>
            <Button variant="primary" icon={<Plus weight="bold" />} onClick={() => setCreating(true)}>
              New subject
            </Button>
          </div>

          {remote.status === "loading" && (
            <div className={styles.grid} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          )}

          {remote.status === "loaded" && subjects.length === 0 && (
            <EmptyState
              icon={<TreeIcon weight="fill" />}
              title="No subjects yet"
              description="Start by adding your first subject — then drop in documents to grow it."
              action={
                <Button variant="primary" icon={<Plus weight="bold" />} onClick={() => setCreating(true)}>
                  New subject
                </Button>
              }
            />
          )}

          {remote.status === "loaded" && subjects.length > 0 && (
            <div className={styles.grid}>
              {subjects.map((s) => (
                <SubjectCard key={s.id} subject={s} />
              ))}
            </div>
          )}

          {remote.status === "error" && (
            <EmptyState
              title="Couldn't load your subjects"
              description="Something went wrong reading local data."
            />
          )}
        </div>
      </main>

      <CreateSubjectModal open={creating} onClose={() => setCreating(false)} onCreate={handleCreate} />
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
