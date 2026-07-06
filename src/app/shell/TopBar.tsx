import { type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { CalendarBlank, Gear, HardDrives, House, type Icon, ListChecks, NotePencil, Tree } from "@phosphor-icons/react";
import { IconButton } from "../../components";
import { openQuickNote } from "../../lib/quickNote";
import { useSlideThumb } from "./useSlideThumb";
import styles from "./TopBar.module.css";

type NavDef = { to: string; label: string; end?: boolean; icon: Icon };

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
    { to: "/", label: "Home", end: true, icon: House },
    { to: "/calendar", label: "Calendar", icon: CalendarBlank },
  ];

  const activeIndex = navDefs.findIndex((d) =>
    d.end ? pathname === d.to : pathname.startsWith(d.to),
  );
  const { navRef, setLinkRef, thumb, animate } = useSlideThumb(activeIndex, !hideNav);

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
        <nav ref={navRef} className={styles.center} aria-label="Primary">
          {thumb && (
            <span
              aria-hidden="true"
              className={`${styles.thumb} ${animate ? "" : styles.noTransition}`}
              style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
            />
          )}
          {navDefs.map(({ to, label, end, icon: IconCmp }, i) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              ref={setLinkRef(i)}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
            >
              <IconCmp weight="fill" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}

      <div className={styles.right}>
        <IconButton label="Tasks" icon={<ListChecks />} onClick={() => navigate("/todos")} />
        <IconButton label="Drive" icon={<HardDrives />} onClick={() => navigate("/drive")} />
        <IconButton label="Quick note" icon={<NotePencil />} onClick={openQuickNote} />
        <IconButton label="Settings" icon={<Gear />} onClick={() => navigate("/settings")} />
      </div>
    </header>
  );
}
