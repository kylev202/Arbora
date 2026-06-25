import { useEffect, useRef, useState } from "react";
import { CheckCircle, FileArrowUp, FilePlus } from "@phosphor-icons/react";
import { Button, Modal, ProgressBar } from "../../components";
import styles from "./AddSourceModal.module.css";

type Phase = "pick" | "processing" | "done";

const STEPS = [
  { at: 0, label: "Parsing document…" },
  { at: 0.4, label: "Chunking text…" },
  { at: 0.7, label: "Indexing text chunks…" },
];

/**
 * S-03 — Add source. Drop zone → simulated ingest progress → done. "Run in
 * background" closes the modal while ingest notionally continues (no spinner-only
 * states; progress is announced via aria-live in <ProgressBar>).
 */
export function AddSourceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const timer = useRef<number | undefined>(undefined);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (open) {
      setPhase("pick");
      setProgress(0);
      setFileName("");
    }
    return () => window.clearInterval(timer.current);
  }, [open]);

  function startMockIngest(name: string) {
    setFileName(name);
    setPhase("processing");
    setProgress(0);
    timer.current = window.setInterval(() => {
      setProgress((p) => {
        const next = Math.min(1, p + 0.06);
        if (next >= 1) {
          window.clearInterval(timer.current);
          setPhase("done");
        }
        return next;
      });
    }, 180);
  }

  const step = [...STEPS].reverse().find((s) => progress >= s.at)?.label ?? STEPS[0].label;
  const secondsLeft = Math.max(0, Math.round((1 - progress) * 8));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add document"
      footer={
        phase === "processing" ? (
          <Button variant="secondary" onClick={onClose}>
            Run in background
          </Button>
        ) : phase === "done" ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : undefined
      }
    >
      {phase === "pick" && (
        <div className={styles.dropzone}>
          <FileArrowUp className={styles.dropIcon} aria-hidden="true" />
          <p className={styles.dropText}>Drop a PDF, slide deck, or audio file here</p>
          <p className={styles.dropHint}>or choose one to add to this subject</p>
          <Button
            variant="primary"
            icon={<FilePlus weight="bold" />}
            onClick={() => startMockIngest("Chapter 3 — Genetics.pdf")}
          >
            Choose file
          </Button>
        </div>
      )}

      {phase === "processing" && (
        <div className={styles.status}>
          <p className={styles.fileName}>{fileName}</p>
          <ProgressBar value={progress} label={step} detail={`About ${secondsLeft} seconds remaining`} />
        </div>
      )}

      {phase === "done" && (
        <div className={styles.done}>
          <CheckCircle weight="fill" className={styles.doneIcon} aria-hidden="true" />
          <div>
            <p className={styles.fileName}>{fileName}</p>
            <p className={styles.doneText}>Processed and indexed — ready to generate content.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
