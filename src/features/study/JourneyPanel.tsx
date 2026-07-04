import { useNavigate } from "react-router-dom";
import { Check, Circle, Compass, Play } from "@phosphor-icons/react";
import { Button, EmptyState } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { PathStage, WeekWalkthrough } from "../../lib/types";
import styles from "./JourneyPanel.module.css";

/** One position in the week journey: overview → lessons → recall. */
export type JourneyStep =
  | { kind: "overview" }
  | { kind: "lesson"; index: number }
  | { kind: "recall" };

function stepsEqual(a: JourneyStep, b: JourneyStep): boolean {
  return a.kind === b.kind && (a.kind !== "lesson" || b.kind !== "lesson" || a.index === b.index);
}

export function journeyUrl(subjectId: string, weekId: string, weekNumber: number): string {
  return `/subject/${subjectId}/study/journey?week=${weekId}&label=${encodeURIComponent(
    `Week ${weekNumber}`,
  )}`;
}

/** CTA label from progress: not started → started → complete. */
export function journeyCta(wt: WeekWalkthrough): string {
  if (wt.completed_at) return "Revisit the journey";
  const started = wt.reviewed || wt.lessons.some((l) => l.completed_at);
  return started ? "Continue the journey" : "Start the journey";
}

type JourneyItem = { step: JourneyStep; label: string; hint: string; done: boolean };

/** The journey's ordered checkpoints: overview, one per lesson, then recall. */
function journeyItems(wt: WeekWalkthrough): JourneyItem[] {
  return [
    { step: { kind: "overview" }, label: "Overview", hint: "the week at a glance", done: wt.reviewed },
    ...wt.lessons.map((l, i) => ({
      step: { kind: "lesson", index: i } as JourneyStep,
      label: l.title,
      hint: `lesson ${i + 1}`,
      done: l.completed_at !== null,
    })),
    {
      step: { kind: "recall" },
      label: "Recall practice",
      hint: "flashcards grow your tree",
      done: wt.completed_at !== null,
    },
  ];
}

/**
 * The journey's checkpoint list: overview, one step per lesson, recall. Done
 * steps get a check, never a grade — progress only ever accumulates. With
 * `onJump` the steps are buttons (the journey screen's rail); without it the
 * list is a read-only map.
 */
export function JourneyOutline({
  walkthrough,
  current = null,
  onJump,
}: {
  walkthrough: WeekWalkthrough;
  current?: JourneyStep | null;
  onJump?: (step: JourneyStep) => void;
}) {
  const items = journeyItems(walkthrough);

  return (
    <ol className={styles.outline} aria-label="Journey steps">
      {items.map((item, i) => {
        const isCurrent = current !== null && stepsEqual(item.step, current);
        const inner = (
          <>
            <span className={styles.stepIcon} aria-hidden="true">
              {item.done ? <Check weight="bold" /> : <Circle />}
            </span>
            <span className={styles.stepText}>
              <span className={styles.stepLabel}>{item.label}</span>
              <span className={styles.stepHint}>{item.hint}</span>
            </span>
          </>
        );
        return (
          <li
            key={i}
            className={`${styles.step} ${item.done ? styles.done : ""} ${isCurrent ? styles.current : ""}`}
          >
            {onJump ? (
              <button
                type="button"
                className={styles.stepButton}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onJump(item.step)}
              >
                {inner}
              </button>
            ) : (
              <span className={styles.stepButton}>{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Horizontal checkpoint track for the guided session: one dot per step
 * (overview · a lesson each · recall), joined in a line. Dots are clickable to
 * move between steps; a step's title stays hidden until its dot is hovered or
 * focused, so the track stays slim and the note keeps the full width. Done steps
 * carry a check and fill the line behind them — progress only accumulates.
 */
export function JourneyTrack({
  walkthrough,
  current,
  onJump,
}: {
  walkthrough: WeekWalkthrough;
  current: JourneyStep;
  onJump: (step: JourneyStep) => void;
}) {
  const items = journeyItems(walkthrough);
  return (
    <ol className={styles.track} aria-label="Journey steps">
      {items.map((item, i) => {
        const isCurrent = stepsEqual(item.step, current);
        const prevDone = i > 0 && items[i - 1].done;
        return (
          <li key={i} className={`${styles.trackStep} ${prevDone ? styles.trackFilled : ""}`}>
            <button
              type="button"
              className={`${styles.dot} ${item.done ? styles.dotDone : ""} ${
                isCurrent ? styles.dotCurrent : ""
              }`}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`${item.label} — ${item.hint}`}
              onClick={() => onJump(item.step)}
            >
              {item.done && <Check weight="bold" />}
            </button>
            <span className={styles.tip} aria-hidden="true">
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Journey status for one week (WeekMaterials tab): the checkpoint map plus a
 * single CTA into the guided session, or a calm setup prompt when no journey
 * has been generated yet.
 */
export function JourneyPanel({ subjectId, week }: { subjectId: string; week: PathStage }) {
  const navigate = useNavigate();
  const wt = useAsync(() => api.getWeekWalkthrough(subjectId, week.week_id), [subjectId, week.week_id]);
  const open = () => navigate(journeyUrl(subjectId, week.week_id, week.week_number));

  if (wt.status === "loading") return <div className={styles.skeleton} aria-hidden="true" />;

  if (!wt.data) {
    return (
      <EmptyState
        icon={<Compass />}
        title={`No journey for Week ${week.week_number} yet`}
        description="Arbora writes an overview note and a few small lessons from this week's sources — every note cited, and kept only after you've read it."
        action={
          <Button variant="primary" icon={<Play weight="fill" />} onClick={open}>
            Set up the journey
          </Button>
        }
      />
    );
  }

  const total = wt.data.lessons.length + 2;
  const done =
    (wt.data.reviewed ? 1 : 0) +
    wt.data.lessons.filter((l) => l.completed_at).length +
    (wt.data.completed_at ? 1 : 0);

  return (
    <>
      <div className={styles.head}>
        <p className={styles.meta}>
          {wt.data.completed_at ? "Journey complete 🌱" : `${done} of ${total} steps done`}
        </p>
        <Button size="sm" variant="primary" icon={<Play weight="fill" />} onClick={open}>
          {journeyCta(wt.data)}
        </Button>
      </div>
      <JourneyOutline walkthrough={wt.data} />
    </>
  );
}
