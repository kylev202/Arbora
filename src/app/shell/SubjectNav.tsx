import { NavLink } from "react-router-dom";
import { ChartLineUp, GraduationCap, ListChecks, type Icon } from "@phosphor-icons/react";
import styles from "./SubjectNav.module.css";

type NavItem = {
  to: string;
  label: string;
  icon: Icon;
  /** Neutral count badge (never red): e.g. "3 to review", "8 due". */
  badge?: string;
};

export type SubjectNavBadges = {
  /** Items waiting in the review gate (surfaced on Overview). */
  review?: number;
  /** Cards due today (surfaced on Study). */
  today?: number;
};

/**
 * The subject's three pages as one horizontal strip under the top bar —
 * replaces the old 9-item sidebar so there is exactly one clear place for
 * everything: Overview (manage + insights), Plan (plan + deadlines +
 * timeline), Study (sessions + self-paced materials). NavLink gives the
 * active page aria-current="page".
 */
export function SubjectNav({
  subjectId,
  badges,
}: {
  subjectId: string;
  badges: SubjectNavBadges;
}) {
  const base = `/subject/${subjectId}`;
  const items: NavItem[] = [
    {
      to: `${base}/overview`,
      label: "Overview",
      icon: ChartLineUp,
      badge: badges.review ? `${badges.review} to review` : undefined,
    },
    { to: `${base}/plan`, label: "Plan", icon: ListChecks },
    {
      to: `${base}/study`,
      label: "Study",
      icon: GraduationCap,
      badge: badges.today ? `${badges.today} due` : undefined,
    },
  ];

  return (
    <nav className={styles.nav} aria-label="Subject pages">
      {items.map(({ to, label, icon: IconCmp, badge }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
        >
          <IconCmp className={styles.icon} aria-hidden="true" weight="regular" />
          <span>{label}</span>
          {badge != null && <span className={styles.badge}>{badge}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
