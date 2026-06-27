import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SortDescending, X } from "@phosphor-icons/react";
import { Button, EmptyState, IconButton, Kbd } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { FSRSRating, Subject } from "../../lib/types";
import { StudyCard } from "./StudyCard";
import styles from "./InterleavedStudyScreen.module.css";

const KEY_TO_RATING: Record<string, FSRSRating> = {
  "1": "again",
  "2": "hard",
  "3": "good",
  "4": "easy",
};

/**
 * S-Interleaved — FSRS study session mixing due cards from all subjects.
 * Same keyboard controls as the per-subject StudyScreen; adds a subject
 * badge above each card so the context is always clear.
 *
 * ?smart=1 activates deadline-priority ordering: subjects with an upcoming
 * deadline within 7 days come first.
 */
export function InterleavedStudyScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const smart = searchParams.get("smart") === "1";
  const due = useAsync(
    () => (smart ? api.getDueCardsPrioritized() : api.getDueCardsInterleaved()),
    [smart],
  );
  const subjectsAsync = useAsync(() => api.listSubjects(), []);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  const cards = due.data ?? [];
  const total = cards.length;
  const current = cards[index];

  // Build a quick lookup map once subjects are loaded.
  const subjectMap = new Map<string, Subject>(
    (subjectsAsync.data ?? []).map((s) => [s.id, s]),
  );

  const exit = useCallback(() => navigate("/"), [navigate]);

  const rate = useCallback(
    (rating: FSRSRating) => {
      if (current) {
        api.submitCardReview(current.card.id, rating).catch(() => {});
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
              ? "No cards are due across any subject. Come back later."
              : "Great session across all your subjects. Keep the streak going."
          }
          action={
            <div className={styles.doneActions}>
              <Button variant="primary" onClick={() => navigate("/")}>
                Back to subjects
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const subject = current ? subjectMap.get(current.card.subject_id) : undefined;

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <span className={styles.progress}>
          {index + 1} / {total}
          {smart && (
            <span className={styles.smartLabel} aria-label="Sorted by upcoming deadlines">
              <SortDescending aria-hidden="true" />
              By deadline
            </span>
          )}
        </span>
        <IconButton label="End session" size="sm" icon={<X />} onClick={exit} />
      </div>

      {subject && (
        <div className={styles.subjectBadge} aria-label={`Subject: ${subject.name}`}>
          <span
            className={styles.subjectDot}
            style={{ background: subject.color }}
            aria-hidden
          />
          <span>{subject.name}</span>
        </div>
      )}

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
