import { Warning } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import styles from "./Disclaimer.module.css";

export type DisclaimerProps = {
  children?: ReactNode;
  /** "banner" spans full width (S-05 top); "note" is inline (S-04). */
  variant?: "banner" | "note";
};

/**
 * The grounding/"AI can be wrong" notice (Law #1/#2). role=note, never red —
 * it's a calm reminder, not an alarm. Appears at every content-generation and
 * review point (S-04/S-05/S-06).
 */
export function Disclaimer({ children, variant = "note" }: DisclaimerProps) {
  return (
    <div className={`${styles.disclaimer} ${styles[variant]}`} role="note">
      <Warning className={styles.icon} aria-hidden="true" weight="fill" />
      <span>
        {children ?? "AI can make mistakes — verify against the original source before trusting it."}
      </span>
    </div>
  );
}
