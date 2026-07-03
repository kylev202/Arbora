import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { ArrowRight, Exam, X } from "@phosphor-icons/react";
import {
  Button,
  Checkbox,
  Disclaimer,
  EmptyState,
  IconButton,
  ProgressBar,
  SproutLoader,
  Tag,
} from "../../components";
import { api } from "../../lib/api";
import { onTestDone, onTestError, onTestProgress } from "../../lib/ipc";
import type { TestItem, TestKind } from "../../lib/types";
import { ItemRunner, VERDICT_TAG, type ItemOutcome } from "./ItemRunner";
import styles from "./TestScreen.module.css";

const KIND_OPTIONS: { kind: TestKind; label: string; hint: string }[] = [
  { kind: "multiple_choice", label: "Multiple choice", hint: "Pick the right option out of four." },
  { kind: "short_answer", label: "Short answer", hint: "Answer in a sentence or two." },
  { kind: "matching", label: "Connect boxes", hint: "Match terms to their descriptions." },
  { kind: "ordering", label: "Rearrange", hint: "Put steps back in the right order." },
  { kind: "feynman", label: "Feynman", hint: "Explain a concept in your own words." },
];

type Phase =
  | { name: "setup" }
  | { name: "generating"; progress: number; found: number }
  | { name: "running"; items: TestItem[]; index: number; outcomes: ItemOutcome[] }
  | { name: "results"; items: TestItem[]; outcomes: ItemOutcome[] }
  | { name: "error"; message: string };

function errorMessage(raw: string): string {
  if (raw.includes("NO_CHUNKS"))
    return "No processed material for this week yet. Add and ingest sources on the Overview page first.";
  if (raw.includes("NO_ITEMS"))
    return "Couldn't build grounded questions from this material. Try different question styles or add more sources.";
  if (raw.includes("SIDECAR_UNAVAILABLE"))
    return "AI sidecar is not ready. Wait a moment and try again.";
  return "Couldn't generate the test. Make sure Ollama is running and try again.";
}

/**
 * The practice-test flow: choose question styles (one, several, or all) → the
 * AI builds a grounded test from the week's material → one question at a time
 * → a calm recap. Every question carries its citation; nothing is persisted.
 */
export function TestScreen() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const weekId = searchParams.get("week");
  const label = searchParams.get("label") ?? "this subject";

  const [phase, setPhase] = useState<Phase>({ name: "setup" });
  const [kinds, setKinds] = useState<Record<TestKind, boolean>>({
    multiple_choice: true,
    short_answer: true,
    matching: false,
    ordering: false,
    feynman: false,
  });
  const jobRef = useRef<string | null>(null);

  const exit = () => navigate(`/subject/${subjectId}/study`);

  // Live job events for this screen's test generation.
  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    const mine = (id: string) => id === jobRef.current;
    onTestProgress((e) => {
      if (mine(e.job_id)) {
        setPhase((p) =>
          p.name === "generating"
            ? { ...p, progress: e.progress, found: e.items_generated ?? p.found }
            : p,
        );
      }
    }).then((u) => unsubs.push(u));
    onTestDone((e) => {
      if (mine(e.job_id)) {
        setPhase({ name: "running", items: e.items, index: 0, outcomes: [] });
      }
    }).then((u) => unsubs.push(u));
    onTestError((e) => {
      if (mine(e.job_id)) setPhase({ name: "error", message: errorMessage(e.error) });
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  const selected = KIND_OPTIONS.filter((o) => kinds[o.kind]).map((o) => o.kind);
  const allOn = selected.length === KIND_OPTIONS.length;

  async function start() {
    setPhase({ name: "generating", progress: 0, found: 0 });
    try {
      const { job_id } = await api.generateTest(subjectId, weekId, selected);
      jobRef.current = job_id;
    } catch (e) {
      setPhase({ name: "error", message: errorMessage(String(e)) });
    }
  }

  function recordOutcome(outcome: ItemOutcome) {
    setPhase((p) => (p.name === "running" ? { ...p, outcomes: [...p.outcomes, outcome] } : p));
  }

  function next() {
    setPhase((p) => {
      if (p.name !== "running") return p;
      if (p.index + 1 >= p.items.length) {
        return { name: "results", items: p.items, outcomes: p.outcomes };
      }
      return { ...p, index: p.index + 1 };
    });
  }

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Test · {label}</h1>
        <IconButton label="Leave test" icon={<X />} onClick={exit} />
      </div>

      {phase.name === "setup" && (
        <section className={styles.setup} aria-label="Choose question styles">
          <p className={styles.setupIntro}>
            How do you want to be tested? Pick one style, several, or all — the test is built only
            from your material, and every question is cited.
          </p>

          <div className={styles.kindList}>
            <Checkbox
              label="All styles"
              checked={allOn}
              onChange={() =>
                setKinds(
                  Object.fromEntries(KIND_OPTIONS.map((o) => [o.kind, !allOn])) as Record<
                    TestKind,
                    boolean
                  >,
                )
              }
            />
            <div className={styles.kindDivider} aria-hidden="true" />
            {KIND_OPTIONS.map((o) => (
              <div key={o.kind} className={styles.kindRow}>
                <Checkbox
                  label={o.label}
                  checked={kinds[o.kind]}
                  onChange={() => setKinds((prev) => ({ ...prev, [o.kind]: !prev[o.kind] }))}
                />
                <span className={styles.kindHint}>{o.hint}</span>
              </div>
            ))}
          </div>

          <Disclaimer>
            Questions are AI-generated from your sources and shown once — check the citation when
            in doubt. Free-text answers are graded by the AI too; treat feedback as a guide.
          </Disclaimer>

          <div className={styles.setupActions}>
            <Button variant="primary" icon={<Exam weight="fill" />} onClick={() => void start()} disabled={selected.length === 0}>
              Build my test
            </Button>
            <Button variant="ghost" onClick={exit}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      {phase.name === "generating" && (
        <section className={styles.generating} aria-live="polite">
          <SproutLoader label="Writing questions from your material…" />
          <ProgressBar
            value={phase.progress}
            label="Building your test"
            detail={`${phase.found} grounded question${phase.found === 1 ? "" : "s"} so far`}
          />
        </section>
      )}

      {phase.name === "error" && (
        <EmptyState
          title="Couldn't build the test"
          description={phase.message}
          action={
            <div className={styles.setupActions}>
              <Button variant="primary" onClick={() => setPhase({ name: "setup" })}>
                Try again
              </Button>
              <Button variant="ghost" onClick={exit}>
                Back to Study
              </Button>
            </div>
          }
        />
      )}

      {phase.name === "running" && (
        <section aria-label="Test question">
          <p className={styles.progressLine}>
            Question {phase.index + 1} of {phase.items.length}
          </p>
          <ItemRunner
            key={phase.index}
            item={phase.items[phase.index]}
            onAnswered={recordOutcome}
          />
          {phase.outcomes.length > phase.index && (
            <div className={styles.nextRow}>
              <Button variant="primary" icon={<ArrowRight />} onClick={next}>
                {phase.index + 1 >= phase.items.length ? "See results" : "Next question"}
              </Button>
            </div>
          )}
        </section>
      )}

      {phase.name === "results" && <Results items={phase.items} outcomes={phase.outcomes} onExit={exit} />}
    </div>
  );
}

function itemPrompt(item: TestItem): string {
  switch (item.kind) {
    case "multiple_choice":
    case "short_answer":
      return item.question;
    case "matching":
    case "ordering":
      return item.instruction;
    case "feynman":
      return `Explain: ${item.concept}`;
  }
}

/** Calm recap: what went well and what's worth a revisit — never a grade to
 * fear. The tree keeps its size either way. */
function Results({
  items,
  outcomes,
  onExit,
}: {
  items: TestItem[];
  outcomes: ItemOutcome[];
  onExit: () => void;
}) {
  const correct = outcomes.filter((o) => o.verdict === "correct").length;
  const partial = outcomes.filter((o) => o.verdict === "partial").length;
  const revisit = outcomes.length - correct - partial;

  return (
    <section className={styles.results} aria-label="Test results">
      <h2 className={styles.resultsTitle}>Nice work</h2>
      <p className={styles.resultsCounts}>
        {correct} correct
        {partial > 0 && ` · ${partial} partly there`}
        {revisit > 0 && ` · ${revisit} to revisit`}
      </p>

      <ul className={styles.resultsList}>
        {items.map((item, i) => {
          const outcome = outcomes[i];
          if (!outcome) return null;
          const tag = VERDICT_TAG[outcome.verdict];
          return (
            <li key={i} className={styles.resultsItem}>
              <Tag tone={tag.tone}>{tag.label}</Tag>
              <span className={styles.resultsPrompt}>{itemPrompt(item)}</span>
            </li>
          );
        })}
      </ul>

      <div className={styles.setupActions}>
        <Button variant="primary" onClick={onExit}>
          Back to Study
        </Button>
      </div>
    </section>
  );
}
