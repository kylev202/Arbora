import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Plant } from "@phosphor-icons/react";
import { Button, ProgressBar } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { PathStage } from "../../lib/types";
import styles from "./PathTrack.module.css";

type StageState = "done" | "current" | "upcoming" | "empty";

/** Mastery-derived stage states — nothing here can be "overdue" (ADR-0007). */
function stageStates(stages: PathStage[]): StageState[] {
  let currentAssigned = false;
  return stages.map((s) => {
    if (s.total_cards === 0) return "empty";
    if (s.mastered_cards >= s.total_cards) return "done";
    if (!currentAssigned) {
      currentAssigned = true;
      return "current";
    }
    return "upcoming";
  });
}

/**
 * The learning path (§4.3): one stage per outline week, one clear next step.
 * Done stages never lock or expire; a done stage with due cards just offers a
 * neutral refresh. Today's bar fills 0→100% as today's todos complete.
 */
export function PathTrack({ subjectId }: { subjectId: string }) {
  const navigate = useNavigate();
  const path = useAsync(() => api.getSubjectPath(subjectId), [subjectId]);

  if (path.status !== "loaded") return null;
  const { stages, todos_done_today, todos_total_today } = path.data;
  if (stages.length === 0) {
    return (
      <p className={styles.noOutline}>
        Set up your weeks in the <a href={`/subject/${subjectId}/timeline`}>Timeline</a> to see
        your learning path here.
      </p>
    );
  }

  const states = stageStates(stages);
  const todayPct = todos_total_today > 0 ? todos_done_today / todos_total_today : null;

  return (
    <section className={styles.track} aria-label="Learning path">
      {todayPct !== null && (
        <div className={styles.today}>
          <ProgressBar value={todayPct} label={`Today's plan · ${todos_done_today} / ${todos_total_today}`} />
          {todayPct >= 1 && (
            <p className={styles.todayDone} role="status">
              Today's plan complete 🌱
            </p>
          )}
        </div>
      )}

      <ol className={styles.stages}>
        {stages.map((s, i) => {
          const state = states[i];
          return (
            <li key={s.week_id} className={`${styles.stage} ${styles[state]}`}>
              <span className={styles.node} aria-hidden="true">
                {state === "done" ? <Check weight="bold" /> : state === "current" ? <Plant weight="fill" /> : null}
              </span>
              <div className={styles.body}>
                <span className={styles.title}>
                  Week {s.week_number}
                  {s.title ? ` — ${s.title}` : ""}
                </span>
                <span className={styles.meta}>
                  {state === "empty"
                    ? "No material yet"
                    : `${s.mastered_cards} / ${s.total_cards} mastered`}
                  {state === "done" && s.due_cards > 0 && " · worth a refresh"}
                </span>
              </div>
              {state === "current" && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ArrowRight />}
                  onClick={() => navigate(`/subject/${subjectId}/study/session?week=${s.week_id}`)}
                >
                  Study this stage
                </Button>
              )}
              {state === "done" && s.due_cards > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(`/subject/${subjectId}/study/session?week=${s.week_id}`)}
                >
                  Refresh
                </Button>
              )}
              {state === "empty" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/subject/${subjectId}/sources`)}
                >
                  Add material
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
