import styles from "./motifs.module.css";

/**
 * Tree motif system (redesign §1) — the small set of shapes that make Arbora's
 * visual identity: sprout, leaf, growth rings. Usage rules:
 *   - Empty states  → Sprout ("nothing here YET — it will grow")
 *   - Loading       → SproutLoader (never a generic spinner)
 *   - Success/done  → Leaf (something grew)
 *   - Stats/history → GrowthRings (accumulated effort, like tree rings)
 * All are currentColor so they inherit calm, token-driven colors, and are
 * aria-hidden decoration by default (SproutLoader carries role="status").
 */

type MotifProps = {
  /** Pixel size of the square SVG. */
  size?: number;
  className?: string;
};

/** A seedling: two leaves on a stem. The "ready to grow" mark. */
export function SproutMotif({ size = 40, className }: MotifProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M16 27 C 16 22, 16 19, 16 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M16 18 C 15 12, 11 9, 5.5 9 C 6 15, 10 18, 16 18 Z" fill="currentColor" />
      <path
        d="M16 14 C 16.5 9, 20.5 6.5, 26.5 6.5 C 26 12, 22 14.5, 16 14.5 Z"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  );
}

/** A single leaf with a midrib. The "something grew" mark. */
export function LeafMotif({ size = 40, className }: MotifProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path d="M7 25 C 7 14, 15 6, 26 6 C 26 17, 18 25, 7 25 Z" fill="currentColor" />
      <path
        d="M9 23 C 13 19, 18 14, 23 9"
        stroke="var(--color-surface, #fff)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

/** Concentric growth rings — accumulated effort, like a tree's years. */
export function GrowthRingsMotif({ size = 40, className }: MotifProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <circle cx="16.5" cy="16" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16.5" r="8.5" stroke="currentColor" strokeWidth="1.6" opacity="0.65" />
      <circle cx="16.5" cy="16" r="13" stroke="currentColor" strokeWidth="1.3" opacity="0.35" />
    </svg>
  );
}

/**
 * Loading = a sprout gently unfurling (reduced motion → static sprout).
 * Use instead of any spinner (Wireframes S-03; redesign §5.9).
 */
export function SproutLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.loader} role="status">
      <svg viewBox="0 0 32 32" width={40} height={40} aria-hidden="true" fill="none">
        <path
          d="M16 27 C 16 22, 16 19, 16 14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M16 18 C 15 12, 11 9, 5.5 9 C 6 15, 10 18, 16 18 Z"
          fill="currentColor"
          className={styles.loaderLeafLeft}
        />
        <path
          d="M16 14 C 16.5 9, 20.5 6.5, 26.5 6.5 C 26 12, 22 14.5, 16 14.5 Z"
          fill="currentColor"
          opacity="0.72"
          className={styles.loaderLeafRight}
        />
      </svg>
      <span className={styles.loaderLabel}>{label}</span>
    </div>
  );
}
