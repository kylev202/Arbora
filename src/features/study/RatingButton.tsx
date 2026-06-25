import type { FSRSRating } from "../../lib/types";
import { Kbd } from "../../components";
import styles from "./RatingButton.module.css";

const META: Record<FSRSRating, { label: string; sub: string; key: string }> = {
  again: { label: "Again", sub: "Forgot", key: "1" },
  hard: { label: "Hard", sub: "Tough", key: "2" },
  good: { label: "Good", sub: "Got it", key: "3" },
  easy: { label: "Easy", sub: "Easy", key: "4" },
};

/**
 * FSRS rating button. CRITICAL: "Again" is GREY, never red — forgetting is part
 * of learning, not a failure (Design System / a11y-adhd). Colour ramps calmly
 * grey → gold → green → deep green.
 */
export function RatingButton({
  rating,
  onClick,
}: {
  rating: FSRSRating;
  onClick: (rating: FSRSRating) => void;
}) {
  const { label, sub, key } = META[rating];
  return (
    <button type="button" className={`${styles.btn} ${styles[rating]}`} onClick={() => onClick(rating)}>
      <span className={styles.label}>{label}</span>
      <span className={styles.sub}>{sub}</span>
      <Kbd>{key}</Kbd>
    </button>
  );
}
