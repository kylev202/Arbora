import type { ReactNode } from "react";
import styles from "./Tag.module.css";

export type TagTone = "neutral" | "due" | "learning" | "mastered" | "info";

export type TagProps = {
  children: ReactNode;
  tone?: TagTone;
  /** Small leading icon. */
  icon?: ReactNode;
};

/**
 * Compact status label / badge. Note: no "danger" tone — learning states are
 * never red (Design System). "due"/overdue uses muted/gold, not red.
 */
export function Tag({ children, tone = "neutral", icon }: TagProps) {
  return (
    <span className={`${styles.tag} ${styles[tone]}`}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
