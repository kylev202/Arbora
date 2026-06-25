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
};

/** Determinate or indeterminate progress. Never a bare spinner (Wireframes S-03). */
export function ProgressBar({ value, label, showLabel = true, detail }: ProgressBarProps) {
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
          className={`${styles.fill} ${indeterminate ? styles.indeterminate : ""}`}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
      {detail && <span className={styles.detail}>{detail}</span>}
    </div>
  );
}
