import { Link, useNavigate } from "react-router-dom";
import { CalendarBlank, Gear, Tree } from "@phosphor-icons/react";
import { IconButton } from "../../components";
import type { ReactNode } from "react";
import styles from "./TopBar.module.css";

/**
 * Global top bar: brand (→ Home) on the left, an optional breadcrumb, and
 * Calendar + Settings on the right. Present on every screen so both are always
 * reachable (User Flows: "S-09 accessible from every screen").
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
      <div className={styles.right}>
        <IconButton label="Calendar" icon={<CalendarBlank />} onClick={() => navigate("/calendar")} />
        <IconButton label="Settings" icon={<Gear />} onClick={() => navigate("/settings")} />
      </div>
    </header>
  );
}
