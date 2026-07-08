import { useEffect, useState } from "react";
import { CheckCircle, FileText, ListChecks, Plus, Sparkle, UploadSimple } from "@phosphor-icons/react";
import { Button, Checkbox, Disclaimer, EmptyState, Modal, Tag } from "../../components";
import { api } from "../../lib/api";
import type { AssignmentDetail, AssignmentItem, Deadline } from "../../lib/types";
import { ImportAssignmentModal } from "./ImportAssignmentModal";
import styles from "./AssignmentDetailModal.module.css";

/**
 * Assignment detail: the requirements, process, and plan pulled from an
 * uploaded spec, plus the marking rubric. Plan/process steps are a checklist,
 * and each plan step can be pushed to Todos. Upload/replace the spec or rubric
 * from here; both go through the review modal (nothing saved until confirmed).
 */
export function AssignmentDetailModal({
  open,
  onClose,
  subjectId,
  deadline,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  deadline: Deadline | null;
}) {
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<"spec" | "rubric" | null>(null);

  async function load() {
    if (!deadline) return;
    setLoading(true);
    try {
      setDetail(await api.getAssignmentDetail(deadline.id));
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && deadline) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deadline]);

  if (!deadline) return null;

  const hasSpec = !!detail && (detail.overview || detail.items.length > 0);
  const requirements = detail?.items.filter((i) => i.kind === "requirement") ?? [];
  const process = detail?.items.filter((i) => i.kind === "process") ?? [];
  const plan = detail?.items.filter((i) => i.kind === "plan") ?? [];

  async function toggle(item: AssignmentItem) {
    await api.setAssignmentItemDone(item.id, !item.done);
    await load();
  }

  async function addToTodos(item: AssignmentItem) {
    await api.addAssignmentStepTodo(item.id);
    await load();
  }

  return (
    <>
      <Modal
        open={open && uploading === null}
        onClose={onClose}
        title="Assignment"
        meta={deadline.title}
        footer={
          <>
            <Button
              variant="ghost"
              icon={<UploadSimple weight="bold" />}
              onClick={() => setUploading("spec")}
            >
              {hasSpec ? "Replace spec" : "Upload spec"}
            </Button>
            <Button
              variant="ghost"
              icon={<UploadSimple weight="bold" />}
              onClick={() => setUploading("rubric")}
            >
              {detail?.rubric_source_id ? "Replace rubric" : "Upload rubric"}
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        {loading && !detail ? (
          <div className={styles.skeleton} aria-hidden="true" />
        ) : !hasSpec && !detail?.criteria.length ? (
          <EmptyState
            icon={<FileText />}
            title="No spec uploaded yet"
            description="Upload the assignment's spec and Arbora pulls out the requirements, the process, and a plan to finish — for you to check. Upload the rubric to make study briefs more targeted."
          />
        ) : (
          <div className={styles.body}>
            {detail?.overview && (
              <section>
                <h3 className={styles.sectionTitle}>Overview</h3>
                <p className={styles.overview}>{detail.overview}</p>
              </section>
            )}

            {requirements.length > 0 && (
              <section>
                <h3 className={styles.sectionTitle}>Requirements</h3>
                <ul className={styles.bullets}>
                  {requirements.map((r) => (
                    <li key={r.id}>{r.text}</li>
                  ))}
                </ul>
              </section>
            )}

            {process.length > 0 && (
              <section>
                <h3 className={styles.sectionTitle}>Process</h3>
                <div className={styles.checklist}>
                  {process.map((p) => (
                    <Checkbox
                      key={p.id}
                      label={p.text}
                      checked={p.done}
                      onChange={() => toggle(p)}
                    />
                  ))}
                </div>
              </section>
            )}

            {plan.length > 0 && (
              <section>
                <h3 className={styles.sectionTitle}>
                  <ListChecks weight="fill" aria-hidden="true" /> Plan to finish
                </h3>
                <div className={styles.checklist}>
                  {plan.map((p) => (
                    <div key={p.id} className={styles.planRow}>
                      <Checkbox label={p.text} checked={p.done} onChange={() => toggle(p)} />
                      {p.todo_id ? (
                        <Tag tone="mastered">
                          <CheckCircle weight="fill" aria-hidden="true" /> In todos
                        </Tag>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Plus weight="bold" />}
                          onClick={() => addToTodos(p)}
                        >
                          Add to todos
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {detail && detail.criteria.length > 0 && (
              <section>
                <h3 className={styles.sectionTitle}>Marking rubric</h3>
                <div className={styles.rubric}>
                  {detail.criteria.map((c) => (
                    <div key={c.id} className={styles.criterion}>
                      <p className={styles.criterionHead}>
                        <span className={styles.criterionName}>{c.name}</span>
                        {c.weight_text && <span className={styles.criterionWeight}>{c.weight_text}</span>}
                      </p>
                      {c.levels.map((l, i) => (
                        <p key={i} className={styles.level}>
                          {l.label && <span className={styles.levelLabel}>{l.label}</span>}
                          <span className={styles.levelDesc}>{l.descriptor}</span>
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(detail?.spec_source_id || detail?.rubric_source_id) && (
              <p className={styles.fileNote}>
                <Sparkle weight="fill" aria-hidden="true" /> The uploaded{" "}
                {detail.spec_source_id && detail.rubric_source_id
                  ? "spec and rubric are"
                  : "file is"}{" "}
                in your source library, so the study brief can cite it.
              </p>
            )}

            <Disclaimer>AI extracted these from your file — edit by re-uploading.</Disclaimer>
          </div>
        )}
      </Modal>

      <ImportAssignmentModal
        open={uploading !== null}
        onClose={() => setUploading(null)}
        subjectId={subjectId}
        deadline={deadline}
        role={uploading ?? "spec"}
        onCommitted={load}
      />
    </>
  );
}
