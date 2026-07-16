import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileArrowUp, FilePlus, Plus, Sparkle, Trash, WarningCircle } from "@phosphor-icons/react";
import { Button, Disclaimer, IconButton, Input, Modal, Select, Textarea } from "../../components";
import { api } from "../../lib/api";
import type {
  DeadlineType,
  ParsedAssessment,
  ParsedClass,
  ParsedDeadline,
  ParsedUnitInfo,
  ParsedWeek,
} from "../../lib/types";
import styles from "./ImportSyllabusModal.module.css";

type Phase = "pick" | "parsing" | "review" | "error";

const FILE_FILTERS = [
  { name: "Syllabus", extensions: ["pdf", "docx", "pptx", "ppt", "txt", "md", "markdown"] },
];

const DEADLINE_TYPES: DeadlineType[] = ["assignment", "exam", "other"];

const EMPTY_UNIT_INFO: ParsedUnitInfo = {
  unit_code: "",
  coordinator_name: "",
  coordinator_contact: "",
  delivery_summary: "",
  classes: [],
  assessments: [],
};

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
  const [unitInfo, setUnitInfo] = useState<ParsedUnitInfo>(EMPTY_UNIT_INFO);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase("pick");
      setFileName("");
      setError("");
      setTermStart("");
      setWeeks([]);
      setDeadlines([]);
      setUnitInfo(EMPTY_UNIT_INFO);
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
      setUnitInfo(parsed.unit_info ?? EMPTY_UNIT_INFO);
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
  function patchInfo(patch: Partial<ParsedUnitInfo>) {
    setUnitInfo((cur) => ({ ...cur, ...patch }));
  }
  function patchClass(i: number, patch: Partial<ParsedClass>) {
    setUnitInfo((cur) => ({
      ...cur,
      classes: cur.classes.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));
  }
  function patchAssessment(i: number, patch: Partial<ParsedAssessment>) {
    setUnitInfo((cur) => ({
      ...cur,
      assessments: cur.assessments.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));
  }

  async function commit() {
    setCommitting(true);
    setError("");
    // Renumber sequentially so removals/edits never leave gaps; drop nameless
    // deadlines (the backend also skips any the user left without a date).
    const cleanWeeks = weeks.map((w, i) => ({ ...w, week_number: i + 1 }));
    const cleanDeadlines = deadlines.filter((d) => d.title.trim());
    // Drop rows the user emptied out; the backend skips nameless assessments too.
    const cleanInfo: ParsedUnitInfo = {
      ...unitInfo,
      classes: unitInfo.classes.filter(
        (c) => c.label.trim() || c.schedule.trim() || c.attendance.trim(),
      ),
      assessments: unitInfo.assessments.filter((a) => a.name.trim()),
    };
    try {
      await api.commitParsedOutline(
        subjectId,
        termStart.trim() || null,
        cleanWeeks,
        cleanDeadlines,
        cleanInfo,
      );
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
        }${
          unitInfo.assessments.length > 0
            ? ` · ${unitInfo.assessments.length} ${
                unitInfo.assessments.length === 1 ? "assessment" : "assessments"
              }`
            : ""
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
              <h3 className={styles.sectionTitle}>Unit info</h3>
            </div>
            <div className={styles.infoGrid}>
              <Input
                label="Unit code"
                value={unitInfo.unit_code}
                placeholder="e.g. COMP1010"
                onChange={(e) => patchInfo({ unit_code: e.target.value })}
              />
              <Input
                label="Coordinator"
                value={unitInfo.coordinator_name}
                placeholder="Who runs the unit"
                onChange={(e) => patchInfo({ coordinator_name: e.target.value })}
              />
              <Input
                label="Contact"
                value={unitInfo.coordinator_contact}
                placeholder="Email or office"
                onChange={(e) => patchInfo({ coordinator_contact: e.target.value })}
              />
            </div>
            <Textarea
              label="How the unit runs"
              rows={2}
              value={unitInfo.delivery_summary}
              placeholder="Delivery mode, weekly structure, expectations (optional)"
              onChange={(e) => patchInfo({ delivery_summary: e.target.value })}
            />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Classes</h3>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus weight="bold" />}
                onClick={() =>
                  patchInfo({
                    classes: [
                      ...unitInfo.classes,
                      { label: "", schedule: "", mode: "", attendance: "" },
                    ],
                  })
                }
              >
                Add class
              </Button>
            </div>
            {unitInfo.classes.map((c, i) => (
              <div key={i} className={styles.classRow}>
                <div className={styles.classFields}>
                  <Input
                    aria-label={`Class ${i + 1} type`}
                    value={c.label}
                    placeholder="Lecture / Tutorial / Lab"
                    onChange={(e) => patchClass(i, { label: e.target.value })}
                  />
                  <Input
                    aria-label={`Class ${i + 1} schedule`}
                    value={c.schedule}
                    placeholder="e.g. Wed 10:00–11:00"
                    onChange={(e) => patchClass(i, { schedule: e.target.value })}
                  />
                  <Input
                    aria-label={`Class ${i + 1} mode`}
                    value={c.mode}
                    placeholder="On-campus / online"
                    onChange={(e) => patchClass(i, { mode: e.target.value })}
                  />
                  <Input
                    aria-label={`Class ${i + 1} attendance`}
                    value={c.attendance}
                    placeholder="Attendance expected?"
                    onChange={(e) => patchClass(i, { attendance: e.target.value })}
                  />
                </div>
                <IconButton
                  label={`Remove class ${i + 1}`}
                  icon={<Trash />}
                  size="sm"
                  onClick={() =>
                    patchInfo({ classes: unitInfo.classes.filter((_, idx) => idx !== i) })
                  }
                />
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Assessments</h3>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus weight="bold" />}
                onClick={() =>
                  patchInfo({
                    assessments: [
                      ...unitInfo.assessments,
                      { name: "", weight_percent: 0, due_text: "" },
                    ],
                  })
                }
              >
                Add assessment
              </Button>
            </div>
            {unitInfo.assessments.length > 0 && (
              <p className={styles.dropHint}>
                These pre-fill your grade book (scores stay empty until you enter them).
              </p>
            )}
            {unitInfo.assessments.map((a, i) => (
              <div key={i} className={styles.assessRow}>
                <Input
                  aria-label={`Assessment ${i + 1} name`}
                  value={a.name}
                  placeholder="e.g. Assignment 1"
                  onChange={(e) => patchAssessment(i, { name: e.target.value })}
                />
                <Input
                  aria-label={`Assessment ${i + 1} weight percent`}
                  type="number"
                  min={0}
                  max={100}
                  value={a.weight_percent === 0 ? "" : a.weight_percent}
                  placeholder="%"
                  onChange={(e) =>
                    patchAssessment(i, { weight_percent: Number(e.target.value) || 0 })
                  }
                />
                <Input
                  aria-label={`Assessment ${i + 1} due`}
                  value={a.due_text}
                  placeholder="Due (as written)"
                  onChange={(e) => patchAssessment(i, { due_text: e.target.value })}
                />
                <IconButton
                  label={`Remove assessment ${i + 1}`}
                  icon={<Trash />}
                  size="sm"
                  onClick={() =>
                    patchInfo({
                      assessments: unitInfo.assessments.filter((_, idx) => idx !== i),
                    })
                  }
                />
              </div>
            ))}
          </section>

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
                <div className={styles.typeSelect}>
                  <Select
                    aria-label={`Deadline ${i + 1} type`}
                    value={d.type}
                    onChange={(v) => patchDeadline(i, { type: v as DeadlineType })}
                    options={DEADLINE_TYPES.map((t) => ({
                      value: t,
                      label: t[0].toUpperCase() + t.slice(1),
                    }))}
                  />
                </div>
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
