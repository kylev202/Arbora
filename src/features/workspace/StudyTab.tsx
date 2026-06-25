import { useNavigate, useParams } from "react-router-dom";
import { GraduationCap, Play, Timer } from "@phosphor-icons/react";
import { Button, EmptyState, StatTile } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { mockApi } from "../../mocks/api";
import styles from "./StudyTab.module.css";

/** S-02 Study tab — calm start screen. Starting a session is a single click. */
export function StudyTab() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const stats = useAsync(() => mockApi.getStudyStats(subjectId), [subjectId]);

  const start = () => navigate(`/subject/${subjectId}/study/session`);

  if (stats.status === "loading") {
    return (
      <div className="page">
        <div className="screen-header">
          <h1>Study</h1>
        </div>
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  const dueToday = stats.data?.due_today ?? 0;

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Study</h1>
      </div>

      {dueToday === 0 ? (
        <EmptyState
          icon={<span aria-hidden="true">🌱</span>}
          title="All done for today"
          description="Nothing is due right now. Rest is part of learning — your tree keeps its size."
        />
      ) : (
        <div className={styles.start}>
          <div className={styles.headline}>
            <GraduationCap weight="fill" className={styles.icon} aria-hidden="true" />
            <p className={styles.count}>
              <strong>{dueToday}</strong> cards due today
            </p>
          </div>

          <div className={styles.actions}>
            <Button variant="primary" size="md" icon={<Play weight="fill" />} onClick={start}>
              Start studying
            </Button>
            <Button variant="secondary" icon={<Timer />} onClick={start}>
              10 minutes (~8 cards)
            </Button>
          </div>

          <div className={styles.stats}>
            <StatTile value={stats.data?.due_this_week ?? 0} label="Due this week" tone="muted" />
            <StatTile value={stats.data?.mastered ?? 0} label="Mastered" tone="mastered" />
            <StatTile value={`${stats.data?.streak ?? 0}d`} label="Streak" tone="muted" />
          </div>
        </div>
      )}
    </div>
  );
}
