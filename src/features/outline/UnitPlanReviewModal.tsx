import { useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { Button, Disclaimer, IconButton, Input, Modal, Textarea } from "../../components";
import { api } from "../../lib/api";
import type {
  PlanAssessment,
  PlanEssentials,
  PlanWeekDetail,
  UnitPlan,
} from "../../lib/types";
import styles from "./UnitPlanReviewModal.module.css";

/**
 * The review gate for the deep unit plan (ADR-0006, law #2). The background pass
 * read the user's syllabus for the unit's aim, outcomes, teaching team, mark map,
 * and per-week detail — none of which is written until they accept it here.
 *
 * Every row can be edited or dropped. Dropping is the important half: the whole
 * point of the gate is that a misread line never becomes something the student
 * later trusts.
 */
export function UnitPlanReviewModal({
  open,
  onClose,
  subjectId,
  draft,
  onCommitted,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  draft: UnitPlan;
  onCommitted: () => void;
}) {
  const [plan, setPlan] = useState<UnitPlan>(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPlan(draft);
      setSaving(false);
      setError("");
    }
  }, [open, draft]);

  function patchEssentials(patch: Partial<PlanEssentials>) {
    setPlan((p) => ({ ...p, essentials: { ...p.essentials, ...patch } }));
  }
  function patchAssessment(i: number, patch: Partial<PlanAssessment>) {
    setPlan((p) => ({
      ...p,
      assessments: p.assessments.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));
  }
  function patchWeek(i: number, patch: Partial<PlanWeekDetail>) {
    setPlan((p) => ({
      ...p,
      week_details: p.week_details.map((w, idx) => (idx === i ? { ...w, ...patch } : w)),
    }));
  }

  async function accept() {
    setSaving(true);
    setError("");
    // Drop rows the user emptied out rather than writing blanks.
    const cleaned: UnitPlan = {
      essentials: {
        ...plan.essentials,
        outcomes: plan.essentials.outcomes.filter((o) => o.text.trim()),
        staff: plan.essentials.staff.filter((s) => s.name.trim() || s.contact.trim()),
      },
      assessments: plan.assessments.filter((a) => a.name.trim()),
      week_details: plan.week_details,
    };
    try {
      await api.commitUnitPlan(subjectId, cleaned);
      onCommitted();
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  async function discard() {
    await api.dismissUnitPlanDraft(subjectId).catch(() => {});
    onCommitted();
    onClose();
  }

  const { essentials } = plan;
  const meta = [
    essentials.outcomes.length > 0 && `${essentials.outcomes.length} outcomes`,
    plan.assessments.length > 0 && `${plan.assessments.length} assessments`,
    plan.week_details.length > 0 && `${plan.week_details.length} weeks`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review your study plan"
      meta={meta || undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => void discard()} disabled={saving}>
            Discard
          </Button>
          <Button variant="primary" onClick={() => void accept()} disabled={saving}>
            {saving ? "Saving…" : "Save plan"}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <Disclaimer>
          Arbora read this out of your syllabus. It can misread one — check anything you'll rely on,
          and drop what looks wrong.
        </Disclaimer>

        {/* ── Unit at a glance ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Unit at a glance</h3>
          <Textarea
            label="Aim"
            rows={3}
            value={essentials.aim}
            onChange={(e) => patchEssentials({ aim: e.target.value })}
          />
          <Textarea
            label="Assumed knowledge"
            rows={2}
            value={essentials.assumed_knowledge}
            onChange={(e) => patchEssentials({ assumed_knowledge: e.target.value })}
          />
          <div className={styles.pair}>
            <Input
              label="Platform / tools"
              value={essentials.platform}
              onChange={(e) => patchEssentials({ platform: e.target.value })}
            />
            <Input
              label="Credit points"
              value={essentials.credit_points}
              onChange={(e) => patchEssentials({ credit_points: e.target.value })}
            />
          </div>
        </section>

        {/* ── Learning outcomes ── */}
        {essentials.outcomes.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Learning outcomes</h3>
            {essentials.outcomes.map((o, i) => (
              <div key={i} className={styles.outcomeRow}>
                <Input
                  aria-label={`Outcome ${i + 1} code`}
                  value={o.code}
                  placeholder="ULO1"
                  onChange={(e) =>
                    patchEssentials({
                      outcomes: essentials.outcomes.map((x, idx) =>
                        idx === i ? { ...x, code: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Input
                  aria-label={`Outcome ${i + 1} text`}
                  value={o.text}
                  onChange={(e) =>
                    patchEssentials({
                      outcomes: essentials.outcomes.map((x, idx) =>
                        idx === i ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                />
                <IconButton
                  size="sm"
                  label={`Remove outcome ${i + 1}`}
                  icon={<Trash />}
                  onClick={() =>
                    patchEssentials({
                      outcomes: essentials.outcomes.filter((_, idx) => idx !== i),
                    })
                  }
                />
              </div>
            ))}
          </section>
        )}

        {/* ── Teaching team ── */}
        {essentials.staff.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Teaching team</h3>
            {essentials.staff.map((s, i) => (
              <div key={i} className={styles.staffRow}>
                <div className={styles.staffFields}>
                  <Input
                    aria-label={`Staff ${i + 1} name`}
                    value={s.name}
                    placeholder="Name"
                    onChange={(e) =>
                      patchEssentials({
                        staff: essentials.staff.map((x, idx) =>
                          idx === i ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`Staff ${i + 1} role`}
                    value={s.role}
                    placeholder="Role"
                    onChange={(e) =>
                      patchEssentials({
                        staff: essentials.staff.map((x, idx) =>
                          idx === i ? { ...x, role: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`Staff ${i + 1} contact`}
                    value={s.contact}
                    placeholder="Email or office"
                    onChange={(e) =>
                      patchEssentials({
                        staff: essentials.staff.map((x, idx) =>
                          idx === i ? { ...x, contact: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`Staff ${i + 1} consultation`}
                    value={s.consultation}
                    placeholder="Consultation time"
                    onChange={(e) =>
                      patchEssentials({
                        staff: essentials.staff.map((x, idx) =>
                          idx === i ? { ...x, consultation: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </div>
                <IconButton
                  size="sm"
                  label={`Remove staff ${i + 1}`}
                  icon={<Trash />}
                  onClick={() =>
                    patchEssentials({ staff: essentials.staff.filter((_, idx) => idx !== i) })
                  }
                />
              </div>
            ))}
          </section>
        )}

        {/* ── Mark map ── */}
        {plan.assessments.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Mark map</h3>
            <p className={styles.hint}>
              These also pre-fill your grade book. Scores you've already entered are never
              overwritten.
            </p>
            {plan.assessments.map((a, i) => (
              <div key={i} className={styles.assessRow}>
                <div className={styles.assessFields}>
                  <Input
                    aria-label={`Assessment ${i + 1} name`}
                    value={a.name}
                    placeholder="Name"
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
                  <Input
                    aria-label={`Assessment ${i + 1} type`}
                    value={a.kind}
                    placeholder="Individual / group"
                    onChange={(e) => patchAssessment(i, { kind: e.target.value })}
                  />
                  <Input
                    aria-label={`Assessment ${i + 1} outcomes`}
                    value={a.outcomes}
                    placeholder="ULOs"
                    onChange={(e) => patchAssessment(i, { outcomes: e.target.value })}
                  />
                </div>
                <IconButton
                  size="sm"
                  label={`Remove assessment ${i + 1}`}
                  icon={<Trash />}
                  onClick={() =>
                    setPlan((p) => ({
                      ...p,
                      assessments: p.assessments.filter((_, idx) => idx !== i),
                    }))
                  }
                />
              </div>
            ))}
          </section>
        )}

        {/* ── Weekly detail ── */}
        {plan.week_details.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Weekly detail</h3>
            {plan.week_details.map((w, i) => (
              <div key={w.week_number} className={styles.weekBlock}>
                <div className={styles.weekHead}>
                  <span className={styles.weekNo}>Week {w.week_number}</span>
                  <IconButton
                    size="sm"
                    label={`Remove week ${w.week_number} detail`}
                    icon={<Trash />}
                    onClick={() =>
                      setPlan((p) => ({
                        ...p,
                        week_details: p.week_details.filter((_, idx) => idx !== i),
                      }))
                    }
                  />
                </div>
                <Input
                  aria-label={`Week ${w.week_number} lecture`}
                  value={w.lecture}
                  placeholder="Lecture"
                  onChange={(e) => patchWeek(i, { lecture: e.target.value })}
                />
                <Input
                  aria-label={`Week ${w.week_number} lab`}
                  value={w.lab}
                  placeholder="Lab / tutorial"
                  onChange={(e) => patchWeek(i, { lab: e.target.value })}
                />
                <Input
                  aria-label={`Week ${w.week_number} what's due`}
                  value={w.assessment_note}
                  placeholder="Due this week"
                  onChange={(e) => patchWeek(i, { assessment_note: e.target.value })}
                />
                <ItemList
                  label="Focus this week"
                  items={w.focus}
                  weekNumber={w.week_number}
                  onChange={(focus) => patchWeek(i, { focus })}
                />
                <ItemList
                  label="By the end of the week"
                  items={w.deliverables}
                  weekNumber={w.week_number}
                  onChange={(deliverables) => patchWeek(i, { deliverables })}
                />
              </div>
            ))}
          </section>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}

/** An editable list of short lines (focus points / deliverables) for one week. */
function ItemList({
  label,
  items,
  weekNumber,
  onChange,
}: {
  label: string;
  items: string[];
  weekNumber: number;
  onChange: (items: string[]) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className={styles.itemList}>
      <span className={styles.itemLabel}>{label}</span>
      {items.map((text, i) => (
        <div key={i} className={styles.itemRow}>
          <Input
            aria-label={`Week ${weekNumber} ${label} ${i + 1}`}
            value={text}
            onChange={(e) => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))}
          />
          <IconButton
            size="sm"
            label={`Remove week ${weekNumber} ${label} ${i + 1}`}
            icon={<Trash />}
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
          />
        </div>
      ))}
    </div>
  );
}
