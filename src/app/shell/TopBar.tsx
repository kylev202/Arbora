import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { CalendarBlank, Gear, House, Tree } from "@phosphor-icons/react";
import { IconButton } from "../../components";
import styles from "./TopBar.module.css";

type NavDef = { to: string; label: string; end?: boolean };

/**
 * Global top bar: brand (→ Home) on the left, an optional breadcrumb, a centered
 * Home/Calendar nav (the app's two primary destinations, always in view), and
 * Settings on the right. Pass hideNav when a combined strip below the bar already
 * shows these destinations (e.g. inside WorkspaceLayout with focus mode off).
 */
export function TopBar({ breadcrumb, hideNav }: { breadcrumb?: ReactNode; hideNav?: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const navDefs: NavDef[] = [
    { to: "/", label: "Home", end: true },
    { to: "/calendar", label: "Calendar" },
  ];

  const activeIndex = navDefs.findIndex((d) =>
    d.end ? pathname === d.to : pathname.startsWith(d.to),
  );

  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startLeft: number } | null>(null);

  const measure = useCallback(() => {
    const el = linkRefs.current[activeIndex];
    if (!el || activeIndex < 0) return;
    setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeIndex]);

  useLayoutEffect(() => {
    if (dragging || hideNav) return;
    measure();
  }, [measure, dragging, hideNav]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || hideNav) return;
    const ro = new ResizeObserver(() => {
      if (!drag.current) measure();
    });
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measure, hideNav]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
    if (idx !== activeIndex) navigate(navDefs[idx].to);
    else measure();
  };

  const icons = [House, CalendarBlank];

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Link to="/" className={styles.brand} aria-label="Arbora, home">
          <Tree weight="fill" className={styles.brandIcon} aria-hidden="true" />
          <span className={styles.brandName}>Arbora</span>
        </Link>
        {breadcrumb && <div className={styles.breadcrumb}>{breadcrumb}</div>}
      </div>

      {!hideNav && (
        <nav
          ref={navRef}
          className={`${styles.center} ${dragging ? styles.grabbing : ""}`}
          aria-label="Primary"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {thumb && (
            <span
              aria-hidden="true"
              className={`${styles.thumb} ${animate && !dragging ? "" : styles.noTransition}`}
              style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
            />
          )}
          {navDefs.map(({ to, label, end }, i) => {
            const IconCmp = icons[i];
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                ref={(el) => {
                  linkRefs.current[i] = el;
                }}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navActive : ""}`
                }
                draggable={false}
              >
                <IconCmp weight="fill" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}

      <div className={styles.right}>
        <IconButton label="Settings" icon={<Gear />} onClick={() => navigate("/settings")} />
      </div>
    </header>
  );
}
