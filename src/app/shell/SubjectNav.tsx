import { NavLink, useLocation } from "react-router-dom";
import { CalendarBlank, ChartLineUp, GraduationCap, House, ListChecks, type Icon } from "@phosphor-icons/react";
import { useSlideThumb } from "./useSlideThumb";
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
 * timeline), Study (sessions + self-paced materials). Home / Calendar sit
 * ahead of a divider as quick exits back to the app's global destinations.
 *
 * The active page is marked by a single "thumb" pill that springs between
 * segments (iOS segmented-control style); see useSlideThumb.
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

  const { pathname } = useLocation();
  const activeIndex = Math.max(
    0,
    items.findIndex((it) => pathname.startsWith(it.to)),
  );
  const { navRef, setLinkRef, thumb, animate } = useSlideThumb(activeIndex);

  return (
    <nav ref={navRef} className={styles.nav} aria-label="Subject pages">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
      >
        <House className={styles.icon} aria-hidden="true" weight="fill" />
        <span>Home</span>
      </NavLink>
      <NavLink
        to="/calendar"
        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
      >
        <CalendarBlank className={styles.icon} aria-hidden="true" weight="fill" />
        <span>Calendar</span>
      </NavLink>
      <span className={styles.divider} aria-hidden="true" />
      {thumb && (
        <span
          aria-hidden="true"
          className={`${styles.thumb} ${animate ? "" : styles.noTransition}`}
          style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
        />
      )}
      {items.map(({ to, label, icon: IconCmp, badge }, i) => (
        <NavLink
          key={to}
          to={to}
          ref={setLinkRef(i)}
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
