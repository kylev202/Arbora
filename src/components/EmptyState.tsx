import type { ReactNode } from "react";
import { SproutMotif } from "./motifs";
import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** A single primary action (calm: one way forward). */
  action?: ReactNode;
};

/** Friendly empty state: icon + heading + one optional CTA. Never punishing.
 * Defaults to the sprout motif — empty means "not grown YET" (§5.9). */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.icon} aria-hidden="true">
        {icon ?? <SproutMotif />}
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
