import type { ReactNode } from "react";
import styles from "./StatTile.module.css";

export type StatTileProps = {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  /** Accent tone for the value — never "danger" (no red for stats). */
  tone?: "default" | "mastered" | "learning" | "muted";
};

/** A single dashboard number + label (S-08). Calm; no red. */
export function StatTile({ icon, value, label, tone = "default" }: StatTileProps) {
  return (
    <div className={styles.tile}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <div className={styles.text}>
        <div className={`${styles.value} ${styles[tone]}`}>{value}</div>
        <div className={styles.label}>{label}</div>
      </div>
    </div>
  );
}
