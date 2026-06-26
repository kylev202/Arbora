import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { CheckCircle, FileArrowUp, FilePlus, WarningCircle } from "@phosphor-icons/react";
import { Button, Modal, ProgressBar } from "../../components";
import { api } from "../../lib/api";
import { onIngestDone, onIngestError, onIngestProgress } from "../../lib/ipc";
import type { Source } from "../../lib/types";
import styles from "./AddSourceModal.module.css";

type Phase = "pick" | "processing" | "done" | "error";

const STEP_LABEL: Record<string, string> = {
  parsing: "Parsing document…",
  transcribing: "Transcribing audio…",
  chunking: "Chunking text…",
  embedding: "Indexing chunks…",
};

const FILE_FILTERS = [
  {
    name: "Documents & audio",
    extensions: ["pdf", "pptx", "ppt", "mp3", "m4a", "wav", "ogg", "flac", "aac"],
  },
];

/**
 * S-03 — Add source. Native file pick → real ingest (parse → chunk → embed →
 * index) with progress streamed from the sidecar via `ingest:*` events. "Run in
 * background" closes the modal; the Sources list keeps the row live.
 */
export function AddSourceModal({
  open,
  onClose,
  subjectId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  onAdded: (source: Source) => void;
}) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const sourceIdRef = useRef<string | null>(null);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (open) {
      setPhase("pick");
      setProgress(0);
      setStep("");
      setFileName("");
      setError("");
      sourceIdRef.current = null;
    }
  }, [open]);

  // Live ingest updates for the source created in this modal.
  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    const mine = (id: string) => id === sourceIdRef.current;
    onIngestProgress((e) => {
      if (mine(e.source_id)) {
        setProgress(e.progress);
        setStep(e.step);
      }
    }).then((u) => unsubs.push(u));
    onIngestDone((e) => {
      if (mine(e.source_id)) {
        setProgress(1);
        setPhase("done");
      }
    }).then((u) => unsubs.push(u));
    onIngestError((e) => {
      if (mine(e.source_id)) {
        setError(e.error);
        setPhase("error");
      }
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  async function choose() {
    const selected = await openDialog({ multiple: false, filters: FILE_FILTERS });
    if (typeof selected !== "string") return; // cancelled
    setFileName(selected.split(/[\\/]/).pop() ?? selected);
    setPhase("processing");
    setProgress(0);
    setStep("parsing");
    try {
      const source = await api.addSource(subjectId, selected);
      sourceIdRef.current = source.id;
      onAdded(source);
      await api.ingestSource(source.id);
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

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
        ) : phase === "done" || phase === "error" ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : undefined
      }
    >
      {phase === "pick" && (
        <div className={styles.dropzone}>
          <FileArrowUp className={styles.dropIcon} aria-hidden="true" />
          <p className={styles.dropText}>Choose a PDF, slide deck, or audio file</p>
          <p className={styles.dropHint}>Arbora indexes it so every generated item can cite it.</p>
          <Button variant="primary" icon={<FilePlus weight="bold" />} onClick={choose}>
            Choose file
          </Button>
        </div>
      )}

      {phase === "processing" && (
        <div className={styles.status}>
          <p className={styles.fileName}>{fileName}</p>
          <ProgressBar value={progress} label={STEP_LABEL[step] ?? "Processing…"} />
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

      {phase === "error" && (
        <div className={styles.done}>
          <WarningCircle weight="fill" className={styles.doneIcon} aria-hidden="true" />
          <div>
            <p className={styles.fileName}>{fileName || "Couldn't add source"}</p>
            <p className={styles.doneText}>{error}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
