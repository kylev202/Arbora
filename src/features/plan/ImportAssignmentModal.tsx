import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileArrowUp, FilePlus, Plus, Sparkle, Trash, WarningCircle } from "@phosphor-icons/react";
import { Button, Checkbox, Disclaimer, IconButton, Input, Modal, Textarea } from "../../components";
import { api } from "../../lib/api";
import type { Deadline, ParsedRubric, ParsedSpec } from "../../lib/types";
import styles from "./ImportAssignmentModal.module.css";

type Phase = "pick" | "parsing" | "review" | "error";

const FILE_FILTERS = [
  { name: "Document", extensions: ["pdf", "docx", "pptx", "ppt", "txt", "md", "markdown"] },
];

const EMPTY_SPEC: ParsedSpec = {
  overview: "",
  due_date: "",
  requirements: [],
  process_steps: [],
  plan_steps: [],
};

/**
 * Upload an assignment's spec or rubric for one deadline. The AI sidecar
 * extracts editable structure from the user's own file; the user reviews and
 * edits every row, then commits (review-before-trust, ADR-0006). The file also
 * joins the source library linked to the deadline and is ingested, so the
 * study brief can cite it.
 */
export function ImportAssignmentModal({
  open,
  onClose,
  subjectId,
  deadline,
  role,
  onCommitted,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  deadline: Deadline | null;
  role: "spec" | "rubric";
  onCommitted: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [fileName, setFileName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [error, setError] = useState("");
  const [spec, setSpec] = useState<ParsedSpec>(EMPTY_SPEC);
  const [updateDue, setUpdateDue] = useState(false);
  const [rubric, setRubric] = useState<ParsedRubric>({ criteria: [] });
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase("pick");
      setFileName("");
      setFilePath("");
      setError("");
      setSpec(EMPTY_SPEC);
      setUpdateDue(false);
      setRubric({ criteria: [] });
      setCommitting(false);
    }
  }, [open]);

  async function choose() {
    if (!deadline) return;
    const selected = await openDialog({ multiple: false, filters: FILE_FILTERS });
    if (typeof selected !== "string") return; // cancelled
    setFileName(selected.split(/[\\/]/).pop() ?? selected);
    setFilePath(selected);
    setPhase("parsing");
    setError("");
    try {
      if (role === "spec") {
        const parsed = await api.parseAssignmentSpec(subjectId, deadline.id, selected);
        setSpec(parsed);
        setUpdateDue(false);
      } else {
        setRubric(await api.parseRubric(subjectId, deadline.id, selected));
      }
      setPhase("review");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  async function commit() {
    if (!deadline) return;
    setCommitting(true);
    setError("");
    try {
      const source =
        role === "spec"
          ? await api.commitAssignmentSpec(
              subjectId,
              deadline.id,
              filePath,
              {
                ...spec,
                requirements: spec.requirements.filter((s) => s.trim()),
                process_steps: spec.process_steps.filter((s) => s.trim()),
                plan_steps: spec.plan_steps.filter((s) => s.trim()),
              },
              updateDue,
            )
          : await api.commitRubric(subjectId, deadline.id, filePath, {
              criteria: rubric.criteria.filter((c) => c.name.trim()),
            });
      // Ingest in the background so the brief can ground in (and cite) the file.
      api.ingestSource(source.id).catch(() => {});
      onCommitted();
      onClose();
    } catch (e) {
      setError(String(e));
      setCommitting(false);
    }
  }

  function patchList(key: "requirements" | "process_steps" | "plan_steps", i: number, value: string) {
    setSpec((cur) => ({ ...cur, [key]: cur[key].map((s, idx) => (idx === i ? value : s)) }));
  }

  const title = role === "spec" ? "Upload assignment spec" : "Upload rubric";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      meta={deadline?.title}
      footer={
        phase === "review" ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={committing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={commit} disabled={committing}>
              {committing ? "Saving…" : "Save"}
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
          <p className={styles.dropText}>
            {role === "spec" ? "Choose the assignment's spec or brief" : "Choose the marking rubric"}
          </p>
          <p className={styles.dropHint}>
            PDF, Word doc, slides, or a text file. Arbora reads it on-device and pulls out{" "}
            {role === "spec"
              ? "the requirements, process, and a plan to finish"
              : "the criteria and performance levels"}{" "}
            for you to check. Nothing is saved until you confirm.
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
          <p className={styles.dropHint}>Reading the document… this can take a moment.</p>
        </div>
      )}

      {phase === "error" && (
        <div className={styles.parsing}>
          <WarningCircle className={styles.parsingIcon} weight="fill" aria-hidden="true" />
          <p className={styles.fileName}>{fileName || "Couldn't read that file"}</p>
          <p className={styles.dropHint}>{error}</p>
        </div>
      )}

      {phase === "review" && role === "spec" && (
        <div className={styles.review}>
          <Disclaimer>
            AI can misread a document. Check these details before you save them.
          </Disclaimer>

          <Textarea
            label="Overview"
            rows={2}
            value={spec.overview}
            placeholder="What the assignment asks for"
            onChange={(e) => setSpec((cur) => ({ ...cur, overview: e.target.value }))}
          />

          <div className={styles.dueRow}>
            <Input
              label="Due date found"
              type="date"
              value={spec.due_date.slice(0, 10)}
              onChange={(e) => setSpec((cur) => ({ ...cur, due_date: e.target.value }))}
            />
            <Checkbox
              label="Update the deadline's due date"
              checked={updateDue}
              disabled={!spec.due_date.trim()}
              onChange={(e) => setUpdateDue(e.target.checked)}
            />
          </div>

          {(
            [
              ["requirements", "Requirements", "e.g. 2000-word report"],
              ["process_steps", "Process", "e.g. Submit via Turnitin"],
              ["plan_steps", "Plan to finish", "e.g. Draft the introduction"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <section key={key} className={styles.section}>
              <div className={styles.sectionHead}>
                <h3 className={styles.sectionTitle}>{label}</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus weight="bold" />}
                  onClick={() => setSpec((cur) => ({ ...cur, [key]: [...cur[key], ""] }))}
                >
                  Add
                </Button>
              </div>
              {spec[key].map((s, i) => (
                <div key={i} className={styles.itemRow}>
                  <Input
                    aria-label={`${label} ${i + 1}`}
                    value={s}
                    placeholder={placeholder}
                    onChange={(e) => patchList(key, i, e.target.value)}
                  />
                  <IconButton
                    label={`Remove ${label.toLowerCase()} ${i + 1}`}
                    icon={<Trash />}
                    size="sm"
                    onClick={() =>
                      setSpec((cur) => ({ ...cur, [key]: cur[key].filter((_, idx) => idx !== i) }))
                    }
                  />
                </div>
              ))}
            </section>
          ))}

          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      )}

      {phase === "review" && role === "rubric" && (
        <div className={styles.review}>
          <Disclaimer>
            AI can misread a rubric. Check these criteria before you save them.
          </Disclaimer>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Criteria</h3>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus weight="bold" />}
                onClick={() =>
                  setRubric((cur) => ({
                    criteria: [...cur.criteria, { name: "", weight_text: "", levels: [] }],
                  }))
                }
              >
                Add criterion
              </Button>
            </div>
            {rubric.criteria.map((c, i) => (
              <div key={i} className={styles.criterion}>
                <div className={styles.itemRow}>
                  <Input
                    aria-label={`Criterion ${i + 1} name`}
                    value={c.name}
                    placeholder="e.g. Scientific accuracy"
                    onChange={(e) =>
                      setRubric((cur) => ({
                        criteria: cur.criteria.map((x, idx) =>
                          idx === i ? { ...x, name: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <Input
                    aria-label={`Criterion ${i + 1} weight`}
                    className={styles.weight}
                    value={c.weight_text}
                    placeholder="e.g. 30%"
                    onChange={(e) =>
                      setRubric((cur) => ({
                        criteria: cur.criteria.map((x, idx) =>
                          idx === i ? { ...x, weight_text: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <IconButton
                    label={`Remove criterion ${i + 1}`}
                    icon={<Trash />}
                    size="sm"
                    onClick={() =>
                      setRubric((cur) => ({
                        criteria: cur.criteria.filter((_, idx) => idx !== i),
                      }))
                    }
                  />
                </div>
                {c.levels.map((l, j) => (
                  <div key={j} className={styles.levelRow}>
                    <Input
                      aria-label={`Criterion ${i + 1} level ${j + 1} label`}
                      className={styles.levelLabel}
                      value={l.label}
                      placeholder="e.g. HD"
                      onChange={(e) =>
                        setRubric((cur) => ({
                          criteria: cur.criteria.map((x, idx) =>
                            idx === i
                              ? {
                                  ...x,
                                  levels: x.levels.map((y, jdx) =>
                                    jdx === j ? { ...y, label: e.target.value } : y,
                                  ),
                                }
                              : x,
                          ),
                        }))
                      }
                    />
                    <Input
                      aria-label={`Criterion ${i + 1} level ${j + 1} descriptor`}
                      value={l.descriptor}
                      placeholder="What this level requires"
                      onChange={(e) =>
                        setRubric((cur) => ({
                          criteria: cur.criteria.map((x, idx) =>
                            idx === i
                              ? {
                                  ...x,
                                  levels: x.levels.map((y, jdx) =>
                                    jdx === j ? { ...y, descriptor: e.target.value } : y,
                                  ),
                                }
                              : x,
                          ),
                        }))
                      }
                    />
                    <IconButton
                      label={`Remove level ${j + 1}`}
                      icon={<Trash />}
                      size="sm"
                      onClick={() =>
                        setRubric((cur) => ({
                          criteria: cur.criteria.map((x, idx) =>
                            idx === i
                              ? { ...x, levels: x.levels.filter((_, jdx) => jdx !== j) }
                              : x,
                          ),
                        }))
                      }
                    />
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus weight="bold" />}
                  onClick={() =>
                    setRubric((cur) => ({
                      criteria: cur.criteria.map((x, idx) =>
                        idx === i
                          ? { ...x, levels: [...x.levels, { label: "", descriptor: "" }] }
                          : x,
                      ),
                    }))
                  }
                >
                  Add level
                </Button>
              </div>
            ))}
          </section>

          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      )}
    </Modal>
  );
}
