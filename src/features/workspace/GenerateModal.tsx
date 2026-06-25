import { useEffect, useRef, useState } from "react";
import { Cards, Lightbulb, Notebook, Question } from "@phosphor-icons/react";
import { Button, Checkbox, Disclaimer, Modal, ProgressBar } from "../../components";
import styles from "./GenerateModal.module.css";

type ContentType = "notes" | "cards" | "quiz";
type Phase = "select" | "generating" | "done";

/**
 * S-04 — Generate content. Pick types → generate (simulated) → review. The
 * disclaimer (Law #1/#2) is always visible; generated items go to the review
 * gate (S-05), never straight into the deck.
 */
export function GenerateModal({
  open,
  onClose,
  sourceTitles,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
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
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setPhase("select");
      setProgress(0);
      setTypes({ notes: true, cards: true, quiz: true });
    }
    return () => window.clearInterval(timer.current);
  }, [open]);

  const anySelected = types.notes || types.cards || types.quiz;

  function toggle(t: ContentType) {
    setTypes((prev) => ({ ...prev, [t]: !prev[t] }));
  }

  function generate() {
    setPhase("generating");
    setProgress(0);
    timer.current = window.setInterval(() => {
      setProgress((p) => {
        const next = Math.min(1, p + 0.05);
        if (next >= 1) {
          window.clearInterval(timer.current);
          setPhase("done");
        }
        return next;
      });
    }, 160);
  }

  const itemsGenerated = Math.round(progress * 24);

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
            Review {itemsGenerated} items
          </Button>
        ) : undefined
      }
    >
      {phase === "select" && (
        <div className={styles.select}>
          <p className={styles.sources}>{sourceTitles.join(", ")}</p>

          <fieldset className={styles.group}>
            <legend className={styles.legend}>What to generate?</legend>
            <Checkbox
              label="Structured notes"
              icon={<Notebook />}
              checked={types.notes}
              onChange={() => toggle("notes")}
            />
            <Checkbox
              label="Flashcards"
              icon={<Cards />}
              checked={types.cards}
              onChange={() => toggle("cards")}
            />
            <Checkbox
              label="Multiple-choice quiz"
              icon={<Question />}
              checked={types.quiz}
              onChange={() => toggle("quiz")}
            />
          </fieldset>

          <p className={styles.tip}>
            <Lightbulb weight="fill" aria-hidden="true" /> First time with these sources?
            Generating all three is recommended.
          </p>

          <Disclaimer>
            AI can make mistakes. You'll review and edit every item before it's saved.
          </Disclaimer>
        </div>
      )}

      {phase === "generating" && (
        <div className={styles.generating} aria-live="polite">
          <ProgressBar value={progress} label="Generating from your sources…" detail={`${itemsGenerated} items so far`} />
          <p className={styles.tip}>
            <Lightbulb weight="fill" aria-hidden="true" /> Each item is grounded in a specific
            passage and cited.
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className={styles.generating}>
          <p>
            Generated <strong>{itemsGenerated} items</strong>. They're waiting in the review queue —
            nothing is saved until you approve it.
          </p>
          <Disclaimer />
        </div>
      )}
    </Modal>
  );
}
