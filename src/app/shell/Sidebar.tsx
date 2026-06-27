import { NavLink } from "react-router-dom";
import {
  CalendarBlank,
  ChartLineUp,
  ChatCircle,
  Files,
  Graph,
  GraduationCap,
  ListChecks,
  type Icon,
  Notebook,
  Shapes,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import styles from "./Sidebar.module.css";

type NavItem = {
  to: string;
  label: string;
  icon: Icon;
  /** Neutral count badge (never red): e.g. "3 due", "8 today". */
  badge?: ReactNode;
};

export type SidebarBadges = {
  /** Items waiting in the review gate. */
  review?: number;
  /** Cards due today. */
  today?: number;
};

/**
 * Per-subject section nav (S-02). Uses NavLink so the active section gets
 * aria-current="page". Collapses to icon-only below 900px (labels become
 * tooltips); the icon's accessible name is preserved.
 */
export function Sidebar({ subjectId, badges }: { subjectId: string; badges: SidebarBadges }) {
  const base = `/subject/${subjectId}`;
  const items: NavItem[] = [
    { to: `${base}/timeline`, label: "Timeline", icon: CalendarBlank },
    { to: `${base}/sources`, label: "Sources", icon: Files },
    {
      to: `${base}/content`,
      label: "Content",
      icon: Notebook,
      badge: badges.review ? `${badges.review} to review` : undefined,
    },
    {
      to: `${base}/study`,
      label: "Study",
      icon: GraduationCap,
      badge: badges.today ? `${badges.today} today` : undefined,
    },
    { to: `${base}/plan`, label: "Plan", icon: ListChecks },
    { to: `${base}/dashboard`, label: "Dashboard", icon: ChartLineUp },
    { to: `${base}/ask`, label: "Ask", icon: ChatCircle },
    { to: `${base}/map`, label: "Map", icon: Graph },
    { to: `${base}/diagrams`, label: "Diagrams", icon: Shapes },
  ];

  return (
    <nav className={styles.sidebar} aria-label="Subject sections">
      <ul className={styles.list}>
        {items.map(({ to, label, icon: IconCmp, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
              title={label}
            >
              <IconCmp className={styles.icon} aria-hidden="true" weight="regular" />
              <span className={styles.label}>{label}</span>
              {badge != null && <span className={styles.badge}>{badge}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
