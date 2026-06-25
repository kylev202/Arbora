import { Lightbulb, SpeakerHigh } from "@phosphor-icons/react";
import { Button, CitationChip, IconButton } from "../../components";
import { speak } from "../../lib/tts";
import type { Card, FSRSRating } from "../../lib/types";
import { RatingButton } from "./RatingButton";
import styles from "./StudyCard.module.css";

const RATINGS: FSRSRating[] = ["again", "hard", "good", "easy"];

/**
 * S-06 study card. Front = prompt + "Show answer"; back = answer, explanation,
 * citation, and the four FSRS ratings. The reveal is announced via aria-live.
 */
export function StudyCard({
  card,
  flipped,
  onShowAnswer,
  onRate,
}: {
  card: Card;
  flipped: boolean;
  onShowAnswer: () => void;
  onRate: (rating: FSRSRating) => void;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.readAloud}>
        <IconButton
          label="Read aloud"
          size="sm"
          icon={<SpeakerHigh />}
          onClick={() => speak(flipped ? `${card.front}. ${card.back}` : card.front)}
        />
      </div>

      <p className={styles.prompt}>{card.front}</p>

      {/* Polite live region so screen readers announce the revealed answer. */}
      <div aria-live="polite" className={styles.answerRegion}>
        {flipped && (
          <div className={styles.answer}>
            <hr className={styles.divider} />
            <p className={styles.back}>{card.back}</p>
            {card.explanation && (
              <p className={styles.explanation}>
                <Lightbulb weight="fill" aria-hidden="true" /> {card.explanation}
              </p>
            )}
            <CitationChip source={card.source_ref} />
          </div>
        )}
      </div>

      <div className={styles.footer}>
        {flipped ? (
          <div className={styles.ratings}>
            {RATINGS.map((r) => (
              <RatingButton key={r} rating={r} onClick={onRate} />
            ))}
          </div>
        ) : (
          <Button variant="primary" block onClick={onShowAnswer}>
            Show answer
          </Button>
        )}
      </div>
    </div>
  );
}
