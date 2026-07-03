import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Lightbulb, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { Button, Checkbox, CitationChip, Disclaimer, Modal, ProgressBar } from "../../components";
import { api } from "../../lib/api";
import { onBriefDone, onBriefError, onBriefProgress } from "../../lib/ipc";
import type { AssignmentBrief, Deadline, Week } from "../../lib/types";
import styles from "./AssignmentBriefModal.module.css";

type Phase = "setup" | "generating" | "done" | "error";

/**
 * Slice 5 — assignment study brief. Pick the weeks this assignment covers, then
 * generate a grounded, cited brief from that material. The brief goes to the
 * review gate (Law #2), never straight to the subject; once approved it shows
 * here with its citations. The "AI can be wrong" note stays visible.
 */
export function AssignmentBriefModal({
  open,
  onClose,
  subjectId,
  deadline,
  weeks,
  brief,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  deadline: Deadline | null;
  weeks: Week[];
  brief: AssignmentBrief | null;
}) {
  const navigate = useNavigate();
  const [coverage, setCoverage] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState(0);
  const [error, setError] = useState("");
  const jobRef = useRef<string | null>(null);

  // Load this assignment's saved week coverage whenever the modal opens.
  useEffect(() => {
    if (open && deadline) {
      setPhase("setup");
      setProgress(0);
      setItems(0);
      setError("");
      jobRef.current = null;
      api.getAssignmentCoverage(deadline.id).then(setCoverage).catch(() => setCoverage([]));
    }
  }, [open, deadline]);

  // Live brief-generation events for this modal's job.
  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    const mine = (id: string) => id === jobRef.current;
    onBriefProgress((e) => {
      if (mine(e.job_id)) {
        setProgress(e.progress);
        if (e.items_generated != null) setItems(e.items_generated);
      }
    }).then((u) => unsubs.push(u));
    onBriefDone((e) => {
      if (mine(e.job_id)) {
        setItems(e.items_generated);
        setProgress(1);
        setPhase("done");
      }
    }).then((u) => unsubs.push(u));
    onBriefError((e) => {
      if (mine(e.job_id)) {
        setError(e.error);
        setPhase("error");
      }
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!deadline) return null;

  function toggleWeek(weekId: string) {
    const next = coverage.includes(weekId)
      ? coverage.filter((id) => id !== weekId)
      : [...coverage, weekId];
    setCoverage(next);
    void api.setAssignmentCoverage(deadline!.id, next).catch(() => {}); // optimistic
  }

  async function generate() {
    setPhase("generating");
    setProgress(0);
    setItems(0);
    setError("");
    try {
      const { job_id } = await api.generateAssignmentBrief(subjectId, deadline!.id);
      jobRef.current = job_id;
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  const hasOutline = weeks.length > 0;
  const canGenerate = coverage.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Study brief"
      meta={deadline.title}
      footer={
        phase === "setup" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" icon={<Sparkle weight="fill" />} onClick={generate} disabled={!canGenerate}>
              Generate study brief
            </Button>
          </>
        ) : phase === "done" ? (
          <Button variant="primary" onClick={() => navigate(`/subject/${subjectId}/review`)}>
            Review {items} point{items === 1 ? "" : "s"}
          </Button>
        ) : phase === "error" ? (
          <Button variant="primary" onClick={() => setPhase("setup")}>
            Back
          </Button>
        ) : undefined
      }
    >
      {phase === "setup" && (
        <div className={styles.body}>
          {brief && (
            <section className={styles.approved}>
              <h3 className={styles.sectionTitle}>Approved brief</h3>
              <p className={styles.briefContent}>{brief.content}</p>
              <div className={styles.citations}>
                {brief.source_refs.map((ref, i) => (
                  <CitationChip key={i} source={ref} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className={styles.sectionTitle}>Weeks this assignment covers</h3>
            {hasOutline ? (
              <div className={styles.weekList}>
                {weeks.map((w) => (
                  <Checkbox
                    key={w.id}
                    label={`Week ${w.week_number}${w.title ? ` · ${w.title}` : ""}`}
                    checked={coverage.includes(w.id)}
                    onChange={() => toggleWeek(w.id)}
                  />
                ))}
              </div>
            ) : (
              <p className={styles.hint}>
                Set up a unit outline on the Timeline first, then assign materials to its weeks.
                The brief is built from the material in the weeks you pick here.
              </p>
            )}
          </section>

          {hasOutline && (
            <>
              <p className={styles.hint}>
                <Lightbulb weight="fill" aria-hidden="true" /> The brief is generated only from the
                processed materials in the weeks you select, and every point is cited.
              </p>
              <Disclaimer>
                AI can make mistakes. You'll review and edit the brief before it's saved.
              </Disclaimer>
            </>
          )}
        </div>
      )}

      {phase === "generating" && (
        <div className={styles.body} aria-live="polite">
          <ProgressBar value={progress} label="Building your brief…" detail={`${items} point${items === 1 ? "" : "s"} so far`} />
          <p className={styles.hint}>
            <Lightbulb weight="fill" aria-hidden="true" /> Each focus point is grounded in a specific
            passage and cited. Ungrounded points are dropped, not saved.
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className={styles.body}>
          <p>
            Built <strong>{items} focus point{items === 1 ? "" : "s"}</strong>. They're waiting in the
            review queue. Nothing is saved until you approve it.
          </p>
          <Disclaimer />
        </div>
      )}

      {phase === "error" && (
        <div className={styles.body}>
          <p className={styles.errorHead}>
            <WarningCircle weight="fill" aria-hidden="true" /> Couldn't build a brief
          </p>
          <p className={styles.hint}>{error}</p>
        </div>
      )}
    </Modal>
  );
}
