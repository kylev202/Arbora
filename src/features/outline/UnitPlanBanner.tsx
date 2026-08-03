import { useCallback, useEffect, useState } from "react";
import { Sparkle, WarningCircle, X } from "@phosphor-icons/react";
import { Button, IconButton } from "../../components";
import { api } from "../../lib/api";
import type { UnitPlanDraft } from "../../lib/types";
import { UnitPlanReviewModal } from "./UnitPlanReviewModal";
import styles from "./UnitPlanBanner.module.css";

/**
 * Surfaces the background deep-plan pass: quietly while it runs, then as an
 * invitation to review what it found. Nothing has been written at any point —
 * the plan only lands when the user accepts it in the modal (law #2).
 *
 * Mounted on both Overview and the Plan page, since a user can start an import
 * from either and wander off while it runs.
 */
export function UnitPlanBanner({
  subjectId,
  onCommitted,
}: {
  subjectId: string;
  /** Called after an accept or a discard so the host screen can refetch. */
  onCommitted: () => void;
}) {
  const [draft, setDraft] = useState<UnitPlanDraft | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const refresh = useCallback(() => {
    api
      .getUnitPlanDraft(subjectId)
      .then(setDraft)
      .catch(() => setDraft(null));
  }, [subjectId]);

  useEffect(refresh, [refresh]);

  // The pass can finish while the user is on this screen — pick that up without
  // polling. Both events carry the subject, so ignore other subjects' jobs.
  useEffect(() => {
    const unlisten = [
      api.onUnitPlanReady((e) => e.subject_id === subjectId && refresh()),
      api.onUnitPlanError((e) => e.subject_id === subjectId && refresh()),
    ];
    return () => {
      for (const p of unlisten) void p.then((un) => un());
    };
  }, [subjectId, refresh]);

  async function dismiss() {
    setDraft(null);
    await api.dismissUnitPlanDraft(subjectId).catch(() => {});
  }

  if (!draft) return null;

  if (draft.state === "running") {
    return (
      <div className={styles.banner} role="status">
        <Sparkle className={styles.icon} weight="fill" aria-hidden="true" />
        <span className={styles.text}>
          Reading the rest of your syllabus — outcomes, mark map, and week-by-week detail. You can
          keep working; we'll ask you to check it when it's done.
        </span>
      </div>
    );
  }

  if (draft.state === "error") {
    return (
      <div className={`${styles.banner} ${styles.quiet}`} role="status">
        <WarningCircle className={styles.icon} weight="fill" aria-hidden="true" />
        <span className={styles.text}>
          {draft.error === "PLAN_EMPTY"
            ? "Couldn't pull any more detail out of that syllabus. Your weeks and deadlines are still saved."
            : "Couldn't finish reading your syllabus for the full plan. Your weeks and deadlines are still saved."}
        </span>
        <IconButton size="sm" label="Dismiss" icon={<X />} onClick={() => void dismiss()} />
      </div>
    );
  }

  if (!draft.plan) return null;

  return (
    <>
      <div className={`${styles.banner} ${styles.ready}`}>
        <Sparkle className={styles.icon} weight="fill" aria-hidden="true" />
        <span className={styles.text}>
          Your study plan is ready to check — the unit's outcomes, mark map, and what each week
          covers.
        </span>
        <Button size="sm" variant="primary" onClick={() => setReviewing(true)}>
          Review
        </Button>
        <IconButton size="sm" label="Dismiss" icon={<X />} onClick={() => void dismiss()} />
      </div>

      <UnitPlanReviewModal
        open={reviewing}
        onClose={() => setReviewing(false)}
        subjectId={subjectId}
        draft={draft.plan}
        onCommitted={() => {
          setDraft(null);
          onCommitted();
        }}
      />
    </>
  );
}
