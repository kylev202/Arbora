import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { ArrowRight, Play, X } from "@phosphor-icons/react";
import {
  Button,
  CitationChip,
  Disclaimer,
  EmptyState,
  IconButton,
  ProgressBar,
  SproutLoader,
} from "../../components";
import { api } from "../../lib/api";
import {
  onTestDone,
  onTestError,
  onWalkthroughDone,
  onWalkthroughError,
  onWalkthroughProgress,
} from "../../lib/ipc";
import type {
  SourceRef,
  TestItem,
  TestKind,
  WalkthroughLesson,
  WeekWalkthrough,
} from "../../lib/types";
import { ItemRunner } from "../test/ItemRunner";
import { JourneyTrack, type JourneyStep } from "./JourneyPanel";
import { NoteMarkdown } from "./NoteMarkdown";
import styles from "./JourneyScreen.module.css";

function errorMessage(raw: string): string {
  if (raw.includes("NO_CHUNKS"))
    return "No processed material for this week yet. Add and ingest sources on the Overview page first.";
  if (raw.includes("NO_OVERVIEW") || raw.includes("NO_LESSONS"))
    return "Couldn't build grounded notes from this material. Add more sources and try again.";
  if (raw.includes("SIDECAR_UNAVAILABLE"))
    return "AI sidecar is not ready. Wait a moment and try again.";
  return "Couldn't build the journey. Make sure Ollama is running and try again.";
}

/** Where to drop the user in: the first checkpoint that isn't done yet. */
function nextStep(wt: WeekWalkthrough): JourneyStep {
  if (!wt.reviewed) return { kind: "overview" };
  const i = wt.lessons.findIndex((l) => !l.completed_at);
  if (i >= 0) return { kind: "lesson", index: i };
  return { kind: "recall" };
}

type Phase = "loading" | "setup" | "building" | "error" | "journey";

/**
 * The guided week session: overview note → one small lesson at a time (read
 * the note, answer a few varied practice questions) → a recall round of the
 * week's flashcards. Notes are AI-generated and staged; keeping one on first
 * read IS the review gate (law #2). Every note and question is cited (law #1).
 */
export function JourneyScreen() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const weekId = searchParams.get("week") ?? "";
  const label = searchParams.get("label") ?? "This week";

  const [phase, setPhase] = useState<Phase>("loading");
  const [wt, setWt] = useState<WeekWalkthrough | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [step, setStep] = useState<JourneyStep>({ kind: "overview" });
  const jobRef = useRef<string | null>(null);

  const exit = useCallback(() => navigate(`/subject/${subjectId}/study`), [navigate, subjectId]);

  const load = useCallback(
    async (advance: boolean) => {
      try {
        const data = await api.getWeekWalkthrough(subjectId, weekId);
        setWt(data);
        if (data) {
          if (advance) setStep(nextStep(data));
          setPhase("journey");
        } else {
          setPhase("setup");
        }
      } catch (e) {
        setErrorMsg(errorMessage(String(e)));
        setPhase("error");
      }
    },
    [subjectId, weekId],
  );

  useEffect(() => {
    setPhase("loading");
    void load(true);
  }, [load]);

  // Live job events for this screen's walkthrough generation.
  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    const mine = (id: string) => id === jobRef.current;
    onWalkthroughProgress((e) => {
      if (mine(e.job_id)) setProgress(e.progress);
    }).then((u) => unsubs.push(u));
    onWalkthroughDone((e) => {
      if (mine(e.job_id)) void load(true);
    }).then((u) => unsubs.push(u));
    onWalkthroughError((e) => {
      if (mine(e.job_id)) {
        setErrorMsg(errorMessage(e.error));
        setPhase("error");
      }
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") exit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit]);

  async function build() {
    setPhase("building");
    setProgress(0);
    try {
      const { job_id } = await api.generateWeekWalkthrough(subjectId, weekId);
      jobRef.current = job_id;
    } catch (e) {
      setErrorMsg(errorMessage(String(e)));
      setPhase("error");
    }
  }

  async function rebuild() {
    if (wt) await api.deleteWeekWalkthrough(wt.id).catch(() => {});
    setWt(null);
    await build();
  }

  async function keepOverview() {
    if (!wt) return;
    await api.approveWalkthroughOverview(wt.id);
    await load(false);
    setStep({ kind: "lesson", index: 0 });
  }

  async function finishLesson(index: number) {
    if (!wt) return;
    await api.completeWalkthroughLesson(wt.lessons[index].id);
    await load(false);
    setStep(index + 1 < wt.lessons.length ? { kind: "lesson", index: index + 1 } : { kind: "recall" });
  }

  async function finishJourney(thenRecall: boolean) {
    if (wt && !wt.completed_at) await api.completeWalkthrough(wt.id).catch(() => {});
    if (thenRecall) navigate(`/subject/${subjectId}/study/session?week=${weekId}`);
    else exit();
  }

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Journey · {label}</h1>
        <IconButton label="Leave journey" icon={<X />} onClick={exit} />
      </div>

      {phase === "loading" && <div className={styles.skeleton} aria-hidden="true" />}

      {phase === "setup" && (
        <EmptyState
          icon={<span aria-hidden="true">🧭</span>}
          title="Build this week's journey"
          description="Arbora reads this week's sources and writes an overview note plus a few small lessons, each with its own practice questions. Every note is cited, and nothing is kept until you've read it."
          action={
            <div className={styles.actionRow}>
              <Button variant="primary" icon={<Play weight="fill" />} onClick={() => void build()}>
                Build the journey
              </Button>
              <Button variant="ghost" onClick={exit}>
                Back to Study
              </Button>
            </div>
          }
        />
      )}

      {phase === "building" && (
        <section className={styles.building} aria-live="polite">
          <SproutLoader label="Writing this week's notes from your material…" />
          <ProgressBar value={progress} label="Building the journey" />
        </section>
      )}

      {phase === "error" && (
        <EmptyState
          title="Couldn't build the journey"
          description={errorMsg}
          action={
            <div className={styles.actionRow}>
              <Button variant="primary" onClick={() => void build()}>
                Try again
              </Button>
              <Button variant="ghost" onClick={exit}>
                Back to Study
              </Button>
            </div>
          }
        />
      )}

      {phase === "journey" && wt && (
        <div className={styles.journey}>
          <div className={styles.trackBar}>
            <button type="button" className={styles.rebuild} onClick={() => void rebuild()}>
              Rebuild this journey
            </button>
            <JourneyTrack walkthrough={wt} current={step} onJump={setStep} />
          </div>

          <section className={styles.stage}>
            {step.kind === "overview" && (
              <OverviewStep
                wt={wt}
                onKeep={() => keepOverview()}
                onRebuild={() => rebuild()}
                onContinue={() => setStep({ kind: "lesson", index: 0 })}
              />
            )}
            {step.kind === "lesson" && wt.lessons[step.index] && (
              <LessonStep
                key={wt.lessons[step.index].id}
                subjectId={subjectId}
                lesson={wt.lessons[step.index]}
                position={step.index + 1}
                total={wt.lessons.length}
                onFinish={() => finishLesson(step.index)}
              />
            )}
            {step.kind === "recall" && (
              <RecallStep
                complete={wt.completed_at !== null}
                onStart={() => void finishJourney(true)}
                onSkip={() => void finishJourney(false)}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** A staged note's body: content plus its citations. Content is Markdown kept
 * as written (same plain rendering as approved notes elsewhere). */
function NoteBody({ content, refs }: { content: string; refs: SourceRef[] }) {
  return (
    <>
      <NoteMarkdown content={content} />
      <div className={styles.citations}>
        {refs.map((r, i) => (
          <CitationChip key={i} source={r} />
        ))}
      </div>
    </>
  );
}

/** Wraps a gate/progress action so a failed IPC call surfaces calmly in place. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}

function OverviewStep({
  wt,
  onKeep,
  onRebuild,
  onContinue,
}: {
  wt: WeekWalkthrough;
  onKeep: () => Promise<void>;
  onRebuild: () => Promise<void>;
  onContinue: () => void;
}) {
  const { busy, error, run } = useAction();
  return (
    <article className={styles.note} aria-label="Week overview">
      <h2 className={styles.noteTitle}>The week at a glance</h2>
      <NoteBody content={wt.overview} refs={wt.overview_refs} />
      {!wt.reviewed && (
        <Disclaimer variant="subtle">
          AI-written from your sources — check the citations before you keep it.
        </Disclaimer>
      )}
      <div className={styles.actionRow}>
        {wt.reviewed ? (
          <Button variant="primary" icon={<ArrowRight />} onClick={onContinue}>
            On to lesson 1
          </Button>
        ) : (
          <>
            <Button variant="primary" disabled={busy} onClick={() => void run(onKeep)}>
              Keep this note & start
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void run(onRebuild)}>
              Rewrite the journey
            </Button>
          </>
        )}
      </div>
      {error && (
        <p className={styles.actionError} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

const LESSON_KINDS: TestKind[] = ["multiple_choice", "short_answer", "matching", "ordering", "feynman"];
const QUESTIONS_PER_LESSON = 3;

function pickKinds(): TestKind[] {
  const pool = [...LESSON_KINDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, QUESTIONS_PER_LESSON);
}

/**
 * One lesson checkpoint: read the note (kept via the inline gate on first
 * encounter), then a few varied practice questions. The questions build in the
 * background while the user reads; if they can't be built, the checkpoint can
 * finish anyway — the journey never blocks on the model.
 */
function LessonStep({
  subjectId,
  lesson,
  position,
  total,
  onFinish,
}: {
  subjectId: string;
  lesson: WalkthroughLesson;
  position: number;
  total: number;
  onFinish: () => Promise<void>;
}) {
  const [reading, setReading] = useState(true);
  const [items, setItems] = useState<TestItem[] | null>(null);
  const [genError, setGenError] = useState("");
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const jobRef = useRef<string | null>(null);
  const { busy, error, run } = useAction();

  // Kick off question generation immediately — it runs while the user reads.
  useEffect(() => {
    let cancelled = false;
    api
      .generateLessonTest(subjectId, lesson.id, pickKinds())
      .then(({ job_id }) => {
        if (!cancelled) jobRef.current = job_id;
      })
      .catch((e) => {
        if (!cancelled) setGenError(errorMessage(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId, lesson.id]);

  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    const mine = (id: string) => id === jobRef.current;
    onTestDone((e) => {
      if (mine(e.job_id)) setItems(e.items);
    }).then((u) => unsubs.push(u));
    onTestError((e) => {
      if (mine(e.job_id)) setGenError(errorMessage(e.error));
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  const startPractice = () =>
    run(async () => {
      if (!lesson.reviewed) await api.approveWalkthroughLesson(lesson.id);
      setReading(false);
    });

  if (reading) {
    return (
      <article className={styles.note} aria-label={`Lesson ${position}`}>
        <p className={styles.lessonKicker}>
          Lesson {position} of {total}
        </p>
        <h2 className={styles.noteTitle}>{lesson.title}</h2>
        <NoteBody content={lesson.content} refs={lesson.source_refs} />
        {!lesson.reviewed && (
          <Disclaimer variant="subtle">
            AI-written from your sources — check the citations before you keep it.
          </Disclaimer>
        )}
        <div className={styles.actionRow}>
          <Button variant="primary" disabled={busy} onClick={() => void startPractice()}>
            {lesson.reviewed ? "Practice this lesson" : "Keep this note & practice"}
          </Button>
        </div>
        {error && (
          <p className={styles.actionError} role="alert">
            {error}
          </p>
        )}
      </article>
    );
  }

  if (genError) {
    return (
      <section className={styles.practice} aria-label="Practice">
        <p className={styles.practiceNote}>{genError}</p>
        <div className={styles.actionRow}>
          <Button variant="primary" disabled={busy} onClick={() => void run(onFinish)}>
            Finish this lesson anyway
          </Button>
        </div>
      </section>
    );
  }

  if (items === null) {
    return (
      <section className={styles.practice} aria-live="polite">
        <SproutLoader label="Writing practice questions from this lesson…" />
      </section>
    );
  }

  const last = index + 1 >= items.length;
  return (
    <section className={styles.practice} aria-label="Practice question">
      <p className={styles.lessonKicker}>
        {lesson.title} · question {index + 1} of {items.length}
      </p>
      <ItemRunner
        key={index}
        item={items[index]}
        onAnswered={() => setAnswered((n) => Math.max(n, index + 1))}
      />
      {answered > index && (
        <div className={styles.actionRow}>
          <Button
            variant="primary"
            icon={<ArrowRight />}
            disabled={busy}
            onClick={() => (last ? void run(onFinish) : setIndex((i) => i + 1))}
          >
            {last ? "Finish this lesson" : "Next question"}
          </Button>
        </div>
      )}
      {error && (
        <p className={styles.actionError} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function RecallStep({
  complete,
  onStart,
  onSkip,
}: {
  complete: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <EmptyState
      icon={<span aria-hidden="true">🌱</span>}
      title={complete ? "Journey complete" : "One last step: recall"}
      description={
        complete
          ? "You've been through this week. Revisit any lesson from the map, or run another recall round — your tree keeps everything it grew."
          : "A quick flashcard round on this week's material. Rating what you remember is what grows your tree — and skipping is always fine."
      }
      action={
        <div className={styles.actionRow}>
          <Button variant="primary" icon={<Play weight="fill" />} onClick={onStart}>
            Start the recall round
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            {complete ? "Back to Study" : "Finish without recall"}
          </Button>
        </div>
      }
    />
  );
}
