import { Link, useParams } from "react-router-dom";
import { CalendarBlank, CheckCircle, Circle, Flame, Target } from "@phosphor-icons/react";
import { StatTile, Tree } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { relativeDays } from "../../lib/date";
import type { TreeData } from "../../lib/types";
import styles from "./DashboardScreen.module.css";

/**
 * S-08 — Dashboard: the tree (achievement, only grows) on the left, neutral
 * stats on the right. "Due today" is information, NOT punishment, and is kept
 * separate from the tree's state (Tree Metaphor).
 */

// The tree is an achievement display — it must only grow, never regress.
// We track the historical max mastery per subject in localStorage so lapses
// (review→relearning) and new unlearned cards don't shrink the visual tree.
function treeMaxKey(subjectId: string) {
  return `arbora_tree_max_${subjectId}`;
}

function getAchievementTree(subjectId: string, live: TreeData): TreeData {
  let maxMastered = live.concepts_mastered;
  let maxPct = live.mastery_pct;
  try {
    const stored = localStorage.getItem(treeMaxKey(subjectId));
    if (stored) {
      const prev = JSON.parse(stored) as { mastered: number; pct: number };
      maxMastered = Math.max(prev.mastered, live.concepts_mastered);
      maxPct = Math.max(prev.pct, live.mastery_pct);
    }
    localStorage.setItem(treeMaxKey(subjectId), JSON.stringify({ mastered: maxMastered, pct: maxPct }));
  } catch {}
  return {
    ...live,
    concepts_mastered: maxMastered,
    mastery_pct: maxPct,
  };
}

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

  const { tree: liveTree, stats, next_deadline } = dash.data;
  const tree = getAchievementTree(subjectId, liveTree);
  const focusItems = (focus.data ?? []).slice(0, 3);

  return (
    <div className="page-wide">
      <div className="screen-header">
        <h1>Welcome back</h1>
      </div>

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
