import styles from "./ProgressBar.module.css";

export type ProgressBarProps = {
  /** 0..1. Omit for an indeterminate bar (unknown duration). */
  value?: number;
  /** Accessible name, e.g. "Indexing text chunks". */
  label: string;
  /** Show the label + percentage above the bar. */
  showLabel?: boolean;
  /** Optional trailing detail, e.g. "About 20 seconds remaining". */
  detail?: string;
  /** "growth" = learning progress (today's plan, path): accent green fill
   * that GROWS with the growth easing (§3). Default = neutral task progress. */
  variant?: "default" | "growth";
};

/** Determinate or indeterminate progress. Never a bare spinner (Wireframes S-03). */
export function ProgressBar({
  value,
  label,
  showLabel = true,
  detail,
  variant = "default",
}: ProgressBarProps) {
  const indeterminate = value === undefined;
  const pct = indeterminate ? 0 : Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div className={styles.wrap}>
      {showLabel && (
        <div className={styles.labelRow}>
          <span className={styles.label}>{label}</span>
          {!indeterminate && <span className={styles.pct}>{pct}%</span>}
        </div>
      )}
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : 100}
      >
        <div
          className={[
            styles.fill,
            variant === "growth" ? styles.growth : "",
            indeterminate ? styles.indeterminate : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
      {detail && <span className={styles.detail}>{detail}</span>}
    </div>
  );
}
