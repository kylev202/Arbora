import { useId, type ReactNode } from "react";
import styles from "./RadioGroup.module.css";

export type RadioOption<T extends string> = {
  value: T;
  label: string;
  description?: ReactNode;
  /** Leading glyph (e.g. 🌱 preset icon or a Phosphor icon). */
  icon?: ReactNode;
  /** Small trailing note, e.g. "Recommended". */
  badge?: string;
};

export type RadioGroupProps<T extends string> = {
  /** Accessible group name/heading. */
  legend: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Visually hide the legend (when a heading already labels the section). */
  hideLegend?: boolean;
};

/**
 * Card-style single-select. Uses real <input type=radio> in one name group, so
 * arrow-key navigation and screen-reader semantics come for free (role=radiogroup).
 */
export function RadioGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  hideLegend,
}: RadioGroupProps<T>) {
  const name = useId();
  // Short-label groups (no descriptions) render as inline pills, not stacked
  // full-width cards — keeps small choices like a deadline type compact.
  const compact = options.every((opt) => !opt.description);
  return (
    <fieldset className={styles.group}>
      <legend className={hideLegend ? "sr-only" : styles.legend}>{legend}</legend>
      <div className={`${styles.options} ${compact ? styles.compact : ""}`}>
        {options.map((opt) => {
          const checked = opt.value === value;
          return (
            <label
              key={opt.value}
              className={`${styles.option} ${checked ? styles.checked : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                className={styles.input}
              />
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.body}>
                <span className={styles.row}>
                  {opt.icon && (
                    <span className={styles.icon} aria-hidden="true">
                      {opt.icon}
                    </span>
                  )}
                  <span className={styles.label}>{opt.label}</span>
                  {opt.badge && <span className={styles.badge}>{opt.badge}</span>}
                </span>
                {opt.description && (
                  <span className={styles.description}>{opt.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
