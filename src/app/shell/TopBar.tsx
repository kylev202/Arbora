import { Link, NavLink, useNavigate } from "react-router-dom";
import { CalendarBlank, Gear, House, Tree } from "@phosphor-icons/react";
import { IconButton } from "../../components";
import type { ReactNode } from "react";
import styles from "./TopBar.module.css";

/**
 * Global top bar: brand (→ Home) on the left, an optional breadcrumb, a centered
 * Home/Calendar nav (the app's two primary destinations, always in view), and
 * Settings on the right. Present on every screen so all are always reachable
 * (User Flows: "S-09 accessible from every screen").
 */
export function TopBar({ breadcrumb }: { breadcrumb?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Link to="/" className={styles.brand} aria-label="Arbora, home">
          <Tree weight="fill" className={styles.brandIcon} aria-hidden="true" />
          <span className={styles.brandName}>Arbora</span>
        </Link>
        {breadcrumb && <div className={styles.breadcrumb}>{breadcrumb}</div>}
      </div>

      <nav className={styles.center} aria-label="Primary">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
        >
          <House weight="fill" aria-hidden="true" />
          <span>Home</span>
        </NavLink>
        <NavLink
          to="/calendar"
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
        >
          <CalendarBlank weight="fill" aria-hidden="true" />
          <span>Calendar</span>
        </NavLink>
      </nav>

      <div className={styles.right}>
        <IconButton label="Settings" icon={<Gear />} onClick={() => navigate("/settings")} />
      </div>
    </header>
  );
}
