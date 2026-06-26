import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X } from "@phosphor-icons/react";
import { Button, EmptyState, IconButton, Kbd } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { FSRSRating } from "../../lib/types";
import { StudyCard } from "./StudyCard";
import styles from "./StudyScreen.module.css";

const KEY_TO_RATING: Record<string, FSRSRating> = {
  "1": "again",
  "2": "hard",
  "3": "good",
  "4": "easy",
};

/**
 * S-06 — active-recall study session (FSRS). Keyboard-complete: Space reveals,
 * 1-4 rates, Esc exits. Calm completion ("All done today 🌱"); no pressure to
 * continue. The actual scheduling is mocked here (UI-first).
 */
export function StudyScreen() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const due = useAsync(() => api.getDueCards(subjectId), [subjectId]);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  const cards = due.data ?? [];
  const total = cards.length;
  const current = cards[index];

  const exit = useCallback(() => navigate(`/subject/${subjectId}/study`), [navigate, subjectId]);

  const rate = useCallback(
    (rating: FSRSRating) => {
      if (current) {
        // Fire-and-forget: UI advances immediately; FSRS state persists async.
        api.submitCardReview(current.card.id, rating).catch(() => {
          // Rating failed to persist (e.g. sidecar unavailable); UI still advances.
        });
      }
      setFlipped(false);
      setIndex((i) => {
        if (i + 1 >= total) {
          setDone(true);
          return i;
        }
        return i + 1;
      });
    },
    [total, current],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return exit();
      if (done) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      if (flipped && KEY_TO_RATING[e.key]) {
        e.preventDefault();
        rate(KEY_TO_RATING[e.key]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, done, rate, exit]);

  if (due.status === "loading") {
    return <div className="page">{<div className={styles.skeleton} aria-hidden="true" />}</div>;
  }

  if (total === 0 || done) {
    return (
      <div className="page">
        <EmptyState
          icon={<span aria-hidden="true">🌱</span>}
          title={total === 0 ? "Nothing due right now" : "All done today"}
          description={
            total === 0
              ? "Come back when cards are due. Resting is fine — your tree keeps its size."
              : "Nice session. Your tree grows from what you retained — see it on the dashboard."
          }
          action={
            <div className={styles.doneActions}>
              <Button variant="primary" onClick={() => navigate(`/subject/${subjectId}/dashboard`)}>
                See your tree
              </Button>
              <Button variant="ghost" onClick={() => navigate(`/subject/${subjectId}/study`)}>
                Done
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <span className={styles.progress}>
          {index + 1} / {total}
        </span>
        <IconButton label="End session" size="sm" icon={<X />} onClick={exit} />
      </div>

      <div className={styles.cardWrap}>
        {current && (
          <StudyCard
            key={current.card.id}
            card={current.card}
            flipped={flipped}
            onShowAnswer={() => setFlipped(true)}
            onRate={rate}
          />
        )}
      </div>

      <p className={styles.hints}>
        {flipped ? (
          <>
            <Kbd>1</Kbd>–<Kbd>4</Kbd> rate · <Kbd>Esc</Kbd> end
          </>
        ) : (
          <>
            <Kbd>Space</Kbd> show answer · <Kbd>Esc</Kbd> end
          </>
        )}
      </p>
    </div>
  );
}
