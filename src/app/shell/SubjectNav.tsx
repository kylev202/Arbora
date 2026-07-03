import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { CalendarBlank, ChartLineUp, GraduationCap, House, ListChecks, type Icon } from "@phosphor-icons/react";
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

/** Geometry of the sliding thumb, in px relative to the nav's padding box. */
type Thumb = { left: number; width: number };

/**
 * The subject's three pages as one horizontal strip under the top bar —
 * replaces the old 9-item sidebar so there is exactly one clear place for
 * everything: Overview (manage + insights), Plan (plan + deadlines +
 * timeline), Study (sessions + self-paced materials).
 *
 * The active page is marked by a single "thumb" pill that springs between
 * segments (iOS segmented-control style). The thumb can also be grabbed and
 * dragged; releasing over a segment navigates there. NavLink still handles
 * taps and keyboard, and gives the active page aria-current="page".
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

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeIndex = Math.max(
    0,
    items.findIndex((it) => pathname.startsWith(it.to)),
  );

  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startLeft: number } | null>(null);

  /** Read the active segment's geometry from the DOM. */
  const measure = useCallback(() => {
    const el = linkRefs.current[activeIndex];
    if (!el) return;
    setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeIndex]);

  // Position the thumb under the active segment, and keep it there on resize
  // (font/icon load, viewport changes). Skip while dragging so we don't fight
  // the finger.
  useLayoutEffect(() => {
    if (dragging) return;
    measure();
  }, [measure, dragging]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => {
      if (!drag.current) measure();
    });
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measure]);

  // Enable the spring transition only after the first paint, so the thumb
  // doesn't slide in from the corner on mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /** Center-x of each segment, in nav-relative px. */
  const centers = () =>
    linkRefs.current.map((el) => (el ? el.offsetLeft + el.offsetWidth / 2 : 0));

  const nearestIndex = (centerX: number) => {
    const cs = centers();
    let best = activeIndex;
    let bestDist = Infinity;
    cs.forEach((c, i) => {
      const d = Math.abs(c - centerX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Only the active segment is grabbable — tapping another segment should
    // just navigate (NavLink handles that).
    const activeEl = linkRefs.current[activeIndex];
    if (!activeEl || !activeEl.contains(e.target as Node) || !thumb) return;
    drag.current = { startX: e.clientX, startLeft: thumb.left };
    navRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const els = linkRefs.current;
    const first = els[0];
    const last = els[els.length - 1];
    if (!first || !last) return;

    const dx = e.clientX - d.startX;
    const rawCenter = d.startLeft + thumb!.width / 2 + dx;
    const minCenter = first.offsetLeft + first.offsetWidth / 2;
    const maxCenter = last.offsetLeft + last.offsetWidth / 2;
    const center = Math.min(maxCenter, Math.max(minCenter, rawCenter));

    // Morph the thumb to whichever segment it's currently over, but let its
    // position track the finger 1:1.
    const idx = nearestIndex(center);
    const overEl = els[idx]!;
    setThumb({ left: center - overEl.offsetWidth / 2, width: overEl.offsetWidth });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    navRef.current?.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    if (!thumb) return;
    const idx = nearestIndex(thumb.left + thumb.width / 2);
    if (idx !== activeIndex) navigate(items[idx].to);
    else measure(); // snap back onto the active segment
  };

  return (
    <nav
      ref={navRef}
      className={`${styles.nav} ${dragging ? styles.grabbing : ""}`}
      aria-label="Subject pages"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <NavLink
        to="/"
        end
        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
        draggable={false}
      >
        <House className={styles.icon} aria-hidden="true" weight="fill" />
        <span>Home</span>
      </NavLink>
      <NavLink
        to="/calendar"
        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
        draggable={false}
      >
        <CalendarBlank className={styles.icon} aria-hidden="true" weight="fill" />
        <span>Calendar</span>
      </NavLink>
      <span className={styles.divider} aria-hidden="true" />
      {thumb && (
        <span
          aria-hidden="true"
          className={`${styles.thumb} ${animate && !dragging ? "" : styles.noTransition}`}
          style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
        />
      )}
      {items.map(({ to, label, icon: IconCmp, badge }, i) => (
        <NavLink
          key={to}
          to={to}
          ref={(el) => {
            linkRefs.current[i] = el;
          }}
          className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
          draggable={false}
        >
          <IconCmp className={styles.icon} aria-hidden="true" weight="regular" />
          <span>{label}</span>
          {badge != null && <span className={styles.badge}>{badge}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
