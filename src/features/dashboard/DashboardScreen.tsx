import { useParams } from "react-router-dom";
import { CalendarBlank, CheckCircle, Circle, Flame } from "@phosphor-icons/react";
import { StatTile, Tree } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { relativeDays } from "../../lib/date";
import styles from "./DashboardScreen.module.css";

/**
 * S-08 — Dashboard: the tree (achievement, only grows) on the left, neutral
 * stats on the right. "Due today" is information, NOT punishment, and is kept
 * separate from the tree's state (Tree Metaphor).
 */
export function DashboardScreen() {
  const { subjectId = "" } = useParams();
  const dash = useAsync(() => api.getSubjectDashboard(subjectId), [subjectId]);

  if (dash.status === "loading") {
    return <div className="page-wide">{<div className={styles.skeleton} aria-hidden="true" />}</div>;
  }
  if (dash.status === "error" || !dash.data) {
    return <div className="page">Couldn't load the dashboard.</div>;
  }

  const { tree, stats, next_deadline } = dash.data;

  return (
    <div className="page-wide">
      <div className="screen-header">
        <h1>Welcome back</h1>
      </div>

      <div className={styles.grid}>
        <section className={styles.treePane} aria-label="Your progress tree">
          <Tree data={tree} seed={subjectId} size={300} />
        </section>

        <section className={styles.stats}>
          <h2 className={styles.statsTitle}>Progress</h2>
          <div className={styles.tiles}>
            <StatTile icon={<CheckCircle weight="fill" />} value={stats.mastered} label="Cards mastered" tone="mastered" />
            <StatTile icon={<Circle />} value={tree.concepts_learning} label="Cards learning" tone="learning" />
            <StatTile icon={<CalendarBlank />} value={stats.due_today} label="Due today" tone="muted" />
            <StatTile icon={<Flame weight="fill" />} value={`${stats.streak}d`} label="Streak" tone="muted" />
          </div>

          {next_deadline && (
            <div className={styles.deadline}>
              <span className={styles.deadlineLabel}>Upcoming deadline</span>
              <span className={styles.deadlineValue}>
                {next_deadline.title} · {relativeDays(next_deadline.due_at)}
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
