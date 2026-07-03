import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Cards, Lightbulb, Notebook, Question, WarningCircle } from "@phosphor-icons/react";
import { Button, Checkbox, Disclaimer, Modal, ProgressBar } from "../../components";
import { api } from "../../lib/api";
import { onGenerateDone, onGenerateError, onGenerateProgress } from "../../lib/ipc";
import styles from "./GenerateModal.module.css";

type ContentType = "notes" | "cards" | "quiz";
type Phase = "select" | "generating" | "done" | "error";

const ALL_TYPES: ContentType[] = ["notes", "cards", "quiz"];

/**
 * S-04 — Generate content. Pick types → real grounded generation (progress
 * streamed from the sidecar) → review. Disclaimer (Law #1/#2) always visible;
 * items go to the review gate (S-05), never straight into the deck.
 */
export function GenerateModal({
  open,
  onClose,
  subjectId,
  sourceIds,
  sourceTitles,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  sourceIds: string[];
  sourceTitles: string[];
  /** Called when the user proceeds to review the generated items. */
  onGenerated: () => void;
}) {
  const [types, setTypes] = useState<Record<ContentType, boolean>>({
    notes: true,
    cards: true,
    quiz: true,
  });
  const [phase, setPhase] = useState<Phase>("select");
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState(0);
  const [error, setError] = useState("");
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhase("select");
      setProgress(0);
      setItems(0);
      setError("");
      setTypes({ notes: true, cards: true, quiz: true });
      jobRef.current = null;
    }
  }, [open]);

  // Live generation progress for this modal's job.
  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    const mine = (id: string) => id === jobRef.current;
    onGenerateProgress((e) => {
      if (mine(e.job_id)) {
        setProgress(e.progress);
        if (e.items_generated != null) setItems(e.items_generated);
      }
    }).then((u) => unsubs.push(u));
    onGenerateDone((e) => {
      if (mine(e.job_id)) {
        setItems(e.items_generated);
        setProgress(1);
        setPhase("done");
      }
    }).then((u) => unsubs.push(u));
    onGenerateError((e) => {
      if (mine(e.job_id)) {
        setError(e.error);
        setPhase("error");
      }
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  const anySelected = types.notes || types.cards || types.quiz;

  function toggle(t: ContentType) {
    setTypes((prev) => ({ ...prev, [t]: !prev[t] }));
  }

  async function generate() {
    setPhase("generating");
    setProgress(0);
    setItems(0);
    try {
      const selected = ALL_TYPES.filter((t) => types[t]);
      const { job_id } = await api.generateContent(subjectId, sourceIds, selected);
      jobRef.current = job_id;
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate content"
      meta={`${sourceTitles.length} source${sourceTitles.length === 1 ? "" : "s"}`}
      footer={
        phase === "select" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={generate} disabled={!anySelected}>
              Generate
            </Button>
          </>
        ) : phase === "done" ? (
          <Button variant="primary" onClick={onGenerated}>
            Review {items} item{items === 1 ? "" : "s"}
          </Button>
        ) : phase === "error" ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : undefined
      }
    >
      {phase === "select" && (
        <div className={styles.select}>
          <p className={styles.sources}>{sourceTitles.join(", ")}</p>

          <fieldset className={styles.group}>
            <legend className={styles.legend}>What to generate?</legend>
            <Checkbox label="Structured notes" icon={<Notebook />} checked={types.notes} onChange={() => toggle("notes")} />
            <Checkbox label="Flashcards" icon={<Cards />} checked={types.cards} onChange={() => toggle("cards")} />
            <Checkbox label="Multiple-choice quiz" icon={<Question />} checked={types.quiz} onChange={() => toggle("quiz")} />
          </fieldset>

          <p className={styles.tip}>
            <Lightbulb weight="fill" aria-hidden="true" /> First time with these sources?
            Generating all three is recommended.
          </p>

          <Disclaimer>AI can make mistakes. You'll review and edit every item before it's saved.</Disclaimer>
        </div>
      )}

      {phase === "generating" && (
        <div className={styles.generating} aria-live="polite">
          <ProgressBar value={progress} label="Generating from your sources…" detail={`${items} items so far`} />
          <p className={styles.tip}>
            <Lightbulb weight="fill" aria-hidden="true" /> Each item is grounded in a specific
            passage and cited. Ungrounded items are dropped, not saved.
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className={styles.generating}>
          <p>
            Generated <strong>{items} item{items === 1 ? "" : "s"}</strong>. They're waiting in the
            review queue. Nothing is saved until you approve it.
          </p>
          <Disclaimer />
        </div>
      )}

      {phase === "error" && (
        <div className={styles.generating}>
          <p className={styles.sources}>
            <WarningCircle weight="fill" aria-hidden="true" /> Generation failed
          </p>
          <p>{error}</p>
        </div>
      )}
    </Modal>
  );
}
