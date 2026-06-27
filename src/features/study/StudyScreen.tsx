import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SpeakerHigh, SpeakerSlash, Timer, X } from "@phosphor-icons/react";
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

const TTS_KEY = "arbora_tts";

function useTts() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(TTS_KEY) === "1");

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(TTS_KEY, next ? "1" : "0");
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utt);
    },
    [enabled],
  );

  return { enabled, toggle, speak };
}

function useFocusTimer(minutes: number | null) {
  const endRef = useRef<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!minutes) return;
    const ms = minutes * 60 * 1000;
    endRef.current = Date.now() + ms;
    setRemaining(ms);
    setExpired(false);

    const id = setInterval(() => {
      const left = (endRef.current ?? 0) - Date.now();
      if (left <= 0) {
        setRemaining(0);
        setExpired(true);
        clearInterval(id);
      } else {
        setRemaining(left);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [minutes]);

  const formatted =
    remaining === null
      ? null
      : `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;

  return { formatted, expired };
}

/**
 * S-06 — active-recall study session (FSRS). Keyboard-complete: Space reveals,
 * 1-4 rates, Esc exits. Calm completion ("All done today 🌱"); no pressure.
 *
 * URL params:
 *   ?limit=N  — cap the session to N cards (Quick session)
 *   ?timer=N  — start a focus countdown of N minutes
 */
export function StudyScreen() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const limit = Number(searchParams.get("limit") ?? 50);
  const timerMinutes = searchParams.get("timer") ? Number(searchParams.get("timer")) : null;

  const due = useAsync(() => api.getDueCards(subjectId, limit), [subjectId, limit]);
  const tts = useTts();
  const { formatted: timerDisplay, expired: timerExpired } = useFocusTimer(timerMinutes);
  const [timerDismissed, setTimerDismissed] = useState(false);

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

  // Auto-speak when card front is shown or flipped to back
  useEffect(() => {
    if (!current) return;
    tts.speak(flipped ? current.card.back : current.card.front);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, flipped]);

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

  // Focus timer fired: show calm break prompt (can be dismissed to keep going)
  if (timerExpired && !timerDismissed && !done) {
    return (
      <div className="page">
        <EmptyState
          icon={<span aria-hidden="true">🌿</span>}
          title="Great session!"
          description="Your focus time is up. Take a short break — your tree keeps its size while you rest."
          action={
            <div className={styles.doneActions}>
              <Button variant="primary" onClick={exit}>
                Take a break
              </Button>
              <Button variant="ghost" onClick={() => setTimerDismissed(true)}>
                Keep going
              </Button>
            </div>
          }
        />
      </div>
    );
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
        <div className={styles.barActions}>
          {timerDisplay !== null && (
            <span className={styles.timer} aria-live="off" aria-label={`${timerDisplay} remaining`}>
              <Timer aria-hidden="true" />
              {timerDisplay}
            </span>
          )}
          <IconButton
            label={tts.enabled ? "Mute text-to-speech" : "Enable text-to-speech"}
            size="sm"
            icon={tts.enabled ? <SpeakerHigh /> : <SpeakerSlash />}
            onClick={tts.toggle}
          />
          <IconButton label="End session" size="sm" icon={<X />} onClick={exit} />
        </div>
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
