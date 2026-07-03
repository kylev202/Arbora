import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileArrowUp, FilePlus, Plus, Sparkle, Trash, WarningCircle } from "@phosphor-icons/react";
import { Button, Disclaimer, IconButton, Input, Modal, Textarea } from "../../components";
import { api } from "../../lib/api";
import type { DeadlineType, ParsedDeadline, ParsedWeek } from "../../lib/types";
import styles from "./ImportSyllabusModal.module.css";

type Phase = "pick" | "parsing" | "review" | "error";

const FILE_FILTERS = [
  { name: "Syllabus", extensions: ["pdf", "docx", "pptx", "ppt", "txt", "md", "markdown"] },
];

const DEADLINE_TYPES: DeadlineType[] = ["assignment", "exam", "other"];

/**
 * Slice 4 — import a unit outline from a syllabus. The AI sidecar extracts
 * editable weeks + deadlines from the user's own file; the user reviews and
 * edits every row, then commits. Nothing is written until they accept it
 * (review-before-trust, ADR-0006), and the "AI can be wrong" note stays visible.
 */
export function ImportSyllabusModal({
  open,
  onClose,
  subjectId,
  onCommitted,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  onCommitted: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [termStart, setTermStart] = useState("");
  const [weeks, setWeeks] = useState<ParsedWeek[]>([]);
  const [deadlines, setDeadlines] = useState<ParsedDeadline[]>([]);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase("pick");
      setFileName("");
      setError("");
      setTermStart("");
      setWeeks([]);
      setDeadlines([]);
      setCommitting(false);
    }
  }, [open]);

  async function choose() {
    const selected = await openDialog({ multiple: false, filters: FILE_FILTERS });
    if (typeof selected !== "string") return; // cancelled
    setFileName(selected.split(/[\\/]/).pop() ?? selected);
    setPhase("parsing");
    setError("");
    try {
      const parsed = await api.parseOutlineFile(subjectId, selected);
      setWeeks(parsed.weeks);
      setDeadlines(parsed.deadlines);
      setPhase("review");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  function patchWeek(i: number, patch: Partial<ParsedWeek>) {
    setWeeks((cur) => cur.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  }
  function patchDeadline(i: number, patch: Partial<ParsedDeadline>) {
    setDeadlines((cur) => cur.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function commit() {
    setCommitting(true);
    setError("");
    // Renumber sequentially so removals/edits never leave gaps; drop nameless
    // deadlines (the backend also skips any the user left without a date).
    const cleanWeeks = weeks.map((w, i) => ({ ...w, week_number: i + 1 }));
    const cleanDeadlines = deadlines.filter((d) => d.title.trim());
    try {
      await api.commitParsedOutline(subjectId, termStart.trim() || null, cleanWeeks, cleanDeadlines);
      onCommitted();
      onClose();
    } catch (e) {
      setError(String(e));
      setCommitting(false);
    }
  }

  const empty = weeks.length === 0 && deadlines.length === 0;
  const meta =
    phase === "review"
      ? `${weeks.length} ${weeks.length === 1 ? "week" : "weeks"} · ${deadlines.length} ${
          deadlines.length === 1 ? "deadline" : "deadlines"
        }`
      : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from syllabus"
      meta={meta}
      footer={
        phase === "review" ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={committing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={commit} disabled={committing}>
              {committing ? "Creating…" : "Create outline"}
            </Button>
          </>
        ) : phase === "error" ? (
          <Button variant="primary" onClick={() => setPhase("pick")}>
            Try another file
          </Button>
        ) : undefined
      }
    >
      {phase === "pick" && (
        <div className={styles.dropzone}>
          <FileArrowUp className={styles.dropIcon} aria-hidden="true" />
          <p className={styles.dropText}>Choose your unit syllabus</p>
          <p className={styles.dropHint}>
            PDF, Word doc, slides, or a text file. Arbora reads it on-device and pulls out the weeks and
            deadlines for you to check. Nothing is saved until you confirm.
          </p>
          <Button variant="primary" icon={<FilePlus weight="bold" />} onClick={choose}>
            Choose file
          </Button>
        </div>
      )}

      {phase === "parsing" && (
        <div className={styles.parsing} aria-live="polite">
          <Sparkle className={styles.parsingIcon} weight="fill" aria-hidden="true" />
          <p className={styles.fileName}>{fileName}</p>
          <p className={styles.dropHint}>Reading your syllabus… this can take a moment.</p>
        </div>
      )}

      {phase === "error" && (
        <div className={styles.parsing}>
          <WarningCircle className={styles.parsingIcon} weight="fill" aria-hidden="true" />
          <p className={styles.fileName}>{fileName || "Couldn't read that file"}</p>
          <p className={styles.dropHint}>{error}</p>
        </div>
      )}

      {phase === "review" && (
        <div className={styles.review}>
          <Disclaimer>
            AI can misread a syllabus. Check these weeks and dates before you create the outline.
          </Disclaimer>

          {empty && (
            <p className={styles.dropHint}>
              Nothing clear came back from this file. You can add weeks and deadlines by hand below,
              or cancel and set the outline up manually.
            </p>
          )}

          <Input
            label="Term start (week 1)"
            type="date"
            value={termStart}
            onChange={(e) => setTermStart(e.target.value)}
            hint="Optional: sets each week's date automatically."
          />

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Weeks</h3>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus weight="bold" />}
                onClick={() => setWeeks((c) => [...c, { week_number: c.length + 1, title: "", summary: "" }])}
              >
                Add week
              </Button>
            </div>
            {weeks.map((w, i) => (
              <div key={i} className={styles.weekRow}>
                <span className={styles.weekNum}>{i + 1}</span>
                <div className={styles.weekFields}>
                  <Input
                    aria-label={`Week ${i + 1} topic`}
                    value={w.title}
                    placeholder={`Week ${i + 1} topic`}
                    onChange={(e) => patchWeek(i, { title: e.target.value })}
                  />
                  <Textarea
                    aria-label={`Week ${i + 1} summary`}
                    rows={2}
                    value={w.summary}
                    placeholder="What's covered (optional)"
                    onChange={(e) => patchWeek(i, { summary: e.target.value })}
                  />
                </div>
                <IconButton
                  label={`Remove week ${i + 1}`}
                  icon={<Trash />}
                  size="sm"
                  onClick={() => setWeeks((c) => c.filter((_, idx) => idx !== i))}
                />
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Deadlines</h3>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus weight="bold" />}
                onClick={() =>
                  setDeadlines((c) => [...c, { title: "", due_date: "", type: "assignment" }])
                }
              >
                Add deadline
              </Button>
            </div>
            {deadlines.map((d, i) => (
              <div key={i} className={styles.deadlineRow}>
                <Input
                  aria-label={`Deadline ${i + 1} title`}
                  value={d.title}
                  placeholder="e.g. Assignment 1"
                  onChange={(e) => patchDeadline(i, { title: e.target.value })}
                />
                <Input
                  aria-label={`Deadline ${i + 1} date`}
                  type="date"
                  value={d.due_date.slice(0, 10)}
                  onChange={(e) => patchDeadline(i, { due_date: e.target.value })}
                />
                <select
                  className={styles.typeSelect}
                  aria-label={`Deadline ${i + 1} type`}
                  value={d.type}
                  onChange={(e) => patchDeadline(i, { type: e.target.value as DeadlineType })}
                >
                  {DEADLINE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
                <IconButton
                  label={`Remove deadline ${i + 1}`}
                  icon={<Trash />}
                  size="sm"
                  onClick={() => setDeadlines((c) => c.filter((_, idx) => idx !== i))}
                />
              </div>
            ))}
          </section>

          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      )}
    </Modal>
  );
}
