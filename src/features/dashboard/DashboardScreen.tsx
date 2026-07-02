import { Link, useParams } from "react-router-dom";
import { CalendarBlank, CheckCircle, Circle, Flame, Target } from "@phosphor-icons/react";
import { StatTile, Tree } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { relativeDays } from "../../lib/date";
// Only-grows achievement logic lives in lib/achievementTree (shared with the
// home forest tree — same localStorage keys, so both views agree).
import { getAchievementTree } from "../../lib/achievementTree";
import styles from "./DashboardScreen.module.css";

/**
 * S-08 — Dashboard: the tree (achievement, only grows) on the left, neutral
 * stats on the right. "Due today" is information, NOT punishment, and is kept
 * separate from the tree's state (Tree Metaphor).
 */

export function DashboardScreen() {
  const { subjectId = "" } = useParams();
  const dash = useAsync(() => api.getSubjectDashboard(subjectId), [subjectId]);
  const focus = useAsync(() => api.getPriorityQueue(subjectId), [subjectId]);

  if (dash.status === "loading") {
    return <div className="page-wide">{<div className={styles.skeleton} aria-hidden="true" />}</div>;
  }
  if (dash.status === "error" || !dash.data) {
    return <div className="page">Couldn't load the dashboard.</div>;
  }

  const { tree: liveTree, stats, next_deadline, week_progress } = dash.data;
  const tree = getAchievementTree(subjectId, liveTree);
  const focusItems = (focus.data ?? []).slice(0, 3);
  const week = week_progress.current_week;

  return (
    <div className="page-wide">
      <div className="screen-header">
        <h1>Welcome back</h1>
      </div>

      {/* This week (§4.2): what to learn now, or a clear CTA when empty. */}
      {week && (
        <section className={styles.weekNow} aria-label="This week">
          <div className={styles.weekNowText}>
            <h2 className={styles.weekNowTitle}>
              This week · Week {week.week_number}
              {week.title ? ` — ${week.title}` : ""}
            </h2>
            {week.source_count === 0 ? (
              <p className={styles.weekNowEmpty}>
                No material for this week yet — add this week's slides or readings to study them.
              </p>
            ) : (
              week.summary && <p className={styles.weekNowSummary}>{week.summary}</p>
            )}
          </div>
          {week.source_count === 0 ? (
            <Link to={`/subject/${subjectId}/sources`} className={styles.weekNowCta}>
              Add material
            </Link>
          ) : (
            <Link to={`/subject/${subjectId}/study`} className={styles.weekNowCta}>
              Study this week
            </Link>
          )}
        </section>
      )}

      {focusItems.length > 0 && (
        <section className={styles.focus} aria-label="What to focus on next">
          <h2 className={styles.focusTitle}>Focus next</h2>
          <ul className={styles.focusList}>
            {focusItems.map((p) => (
              <li key={p.week_id}>
                <Link to={`/subject/${subjectId}/timeline`} className={styles.focusItem}>
                  <span className={styles.focusIcon} aria-hidden="true">
                    <Target weight="bold" />
                  </span>
                  <span className={styles.focusText}>
                    <span className={styles.focusWeek}>
                      Week {p.week_number}
                      {p.title ? ` · ${p.title}` : ""}
                    </span>
                    <span className={styles.focusReason}>{p.reason}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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

          {/* Neutral week-over-week information, not judgement (§4.2). */}
          <div className={styles.tiles}>
            <StatTile value={week_progress.reviews_this_week} label="Reviews this week" tone="muted" />
            <StatTile value={week_progress.reviews_last_week} label="Reviews last week" tone="muted" />
            <StatTile value={`${Math.round(tree.mastery_pct * 100)}%`} label="Term mastery" tone="mastered" />
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
