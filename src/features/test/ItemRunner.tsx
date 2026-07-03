import { useMemo, useState } from "react";
import { ArrowsDownUp, CaretDown, CaretUp } from "@phosphor-icons/react";
import { Button, CitationChip, Tag, Textarea } from "../../components";
import { api } from "../../lib/api";
import type { TestGrade, TestItem } from "../../lib/types";
import styles from "./TestScreen.module.css";

/** The outcome of one answered item — verdicts stay calm (never red). */
export type ItemOutcome = {
  verdict: TestGrade["verdict"];
  /** LLM feedback for free-text kinds; empty for locally-graded kinds. */
  feedback: string;
};

export const VERDICT_TAG: Record<ItemOutcome["verdict"], { label: string; tone: "mastered" | "learning" | "neutral" }> = {
  correct: { label: "Correct", tone: "mastered" },
  partial: { label: "Partly there", tone: "learning" },
  incorrect: { label: "To revisit", tone: "learning" },
};

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Renders ONE test item of any kind and reports its outcome once answered.
 * Multiple choice / matching / ordering grade locally against the item's own
 * grounded answer; short answer / Feynman grade through the sidecar.
 */
export function ItemRunner({
  item,
  onAnswered,
}: {
  item: TestItem;
  onAnswered: (outcome: ItemOutcome) => void;
}) {
  switch (item.kind) {
    case "multiple_choice":
      return <MultipleChoiceRunner item={item} onAnswered={onAnswered} />;
    case "short_answer":
      return (
        <FreeTextRunner
          prompt={item.question}
          placeholder="Type your answer…"
          expected={item.expected_answer}
          expectedLabel="Model answer"
          sourceRef={item.source_ref}
          onAnswered={onAnswered}
        />
      );
    case "feynman":
      return (
        <FreeTextRunner
          prompt={`Explain “${item.concept}” in your own words, as if teaching a friend.`}
          placeholder="Explain it simply — what it is, how it works, why it matters…"
          expected={item.key_points.map((p) => `- ${p}`).join("\n")}
          expectedLabel="A good explanation covers"
          sourceRef={item.source_ref}
          rows={6}
          onAnswered={onAnswered}
        />
      );
    case "matching":
      return <MatchingRunner item={item} onAnswered={onAnswered} />;
    case "ordering":
      return <OrderingRunner item={item} onAnswered={onAnswered} />;
  }
}

// ── Multiple choice ─────────────────────────────────────────────────────────

function MultipleChoiceRunner({
  item,
  onAnswered,
}: {
  item: Extract<TestItem, { kind: "multiple_choice" }>;
  onAnswered: (o: ItemOutcome) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;

  function pick(i: number) {
    if (answered) return;
    setPicked(i);
    onAnswered({ verdict: i === item.answer_index ? "correct" : "incorrect", feedback: "" });
  }

  return (
    <div className={styles.item}>
      <p className={styles.prompt}>{item.question}</p>
      <div className={styles.options} role="group" aria-label="Options">
        {item.options.map((opt, i) => {
          const isCorrect = answered && i === item.answer_index;
          const isWrongPick = answered && picked === i && i !== item.answer_index;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.option} ${isCorrect ? styles.optionCorrect : ""} ${isWrongPick ? styles.optionRevisit : ""}`}
              onClick={() => pick(i)}
              disabled={answered}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={styles.reveal}>
          <Tag tone={picked === item.answer_index ? "mastered" : "learning"}>
            {picked === item.answer_index ? "Correct" : "To revisit"}
          </Tag>
          {item.explanation && <p className={styles.explanation}>{item.explanation}</p>}
          <CitationChip source={item.source_ref} />
        </div>
      )}
    </div>
  );
}

// ── Free text (short answer + Feynman) ──────────────────────────────────────

function FreeTextRunner({
  prompt,
  placeholder,
  expected,
  expectedLabel,
  sourceRef,
  rows = 3,
  onAnswered,
}: {
  prompt: string;
  placeholder: string;
  expected: string;
  expectedLabel: string;
  sourceRef: TestItem["source_ref"];
  rows?: number;
  onAnswered: (o: ItemOutcome) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<TestGrade | null>(null);
  const [error, setError] = useState("");

  async function check() {
    if (!answer.trim() || grading || grade) return;
    setGrading(true);
    setError("");
    try {
      const g = await api.gradeTestAnswer(prompt, expected, answer.trim());
      setGrade(g);
      onAnswered({ verdict: g.verdict, feedback: g.feedback });
    } catch {
      setError("Couldn't grade this answer. Make sure Ollama is running and try again.");
    } finally {
      setGrading(false);
    }
  }

  const tag = grade ? VERDICT_TAG[grade.verdict] : null;

  return (
    <div className={styles.item}>
      <p className={styles.prompt}>{prompt}</p>
      <Textarea
        aria-label="Your answer"
        placeholder={placeholder}
        rows={rows}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={grading || !!grade}
      />
      {!grade && (
        <div className={styles.itemActions}>
          <Button variant="primary" size="sm" onClick={() => void check()} disabled={!answer.trim() || grading}>
            {grading ? "Checking…" : "Check answer"}
          </Button>
        </div>
      )}
      {error && (
        <p className={styles.gradeError} role="alert">
          {error}
        </p>
      )}
      {grade && tag && (
        <div className={styles.reveal}>
          <Tag tone={tag.tone}>{tag.label}</Tag>
          <p className={styles.explanation}>{grade.feedback}</p>
          <div className={styles.expected}>
            <span className={styles.expectedLabel}>{expectedLabel}</span>
            <p className={styles.expectedText}>{expected}</p>
          </div>
          <CitationChip source={sourceRef} />
        </div>
      )}
    </div>
  );
}

// ── Matching (connect the boxes) ────────────────────────────────────────────

function MatchingRunner({
  item,
  onAnswered,
}: {
  item: Extract<TestItem, { kind: "matching" }>;
  onAnswered: (o: ItemOutcome) => void;
}) {
  const rights = useMemo(() => shuffled(item.pairs.map((p) => p.right)), [item]);
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  /** picks[leftIndex] = the chosen right string. */
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);

  const allPicked = Object.keys(picks).length === item.pairs.length;

  function pickRight(right: string) {
    if (checked || activeLeft === null) return;
    setPicks((prev) => {
      const next = { ...prev };
      // A right option can back only one left — steal it if reassigned.
      for (const k of Object.keys(next)) {
        if (next[Number(k)] === right) delete next[Number(k)];
      }
      next[activeLeft] = right;
      return next;
    });
    setActiveLeft(null);
  }

  function check() {
    if (!allPicked || checked) return;
    setChecked(true);
    const correct = item.pairs.every((p, i) => picks[i] === p.right);
    onAnswered({ verdict: correct ? "correct" : "incorrect", feedback: "" });
  }

  const usedRights = new Set(Object.values(picks));

  return (
    <div className={styles.item}>
      <p className={styles.prompt}>{item.instruction}</p>
      <p className={styles.matchHint}>Select a term, then its match.</p>
      <div className={styles.matchGrid}>
        <div className={styles.matchColumn} role="group" aria-label="Terms">
          {item.pairs.map((p, i) => {
            const wrong = checked && picks[i] !== p.right;
            return (
              <button
                key={i}
                type="button"
                className={`${styles.matchBox} ${activeLeft === i ? styles.matchActive : ""} ${checked ? (wrong ? styles.optionRevisit : styles.optionCorrect) : ""}`}
                onClick={() => !checked && setActiveLeft(i)}
                aria-pressed={activeLeft === i}
                disabled={checked}
              >
                <span>{p.left}</span>
                {picks[i] && <span className={styles.matchPick}>→ {picks[i]}</span>}
              </button>
            );
          })}
        </div>
        <div className={styles.matchColumn} role="group" aria-label="Matches">
          {rights.map((r) => (
            <button
              key={r}
              type="button"
              className={`${styles.matchBox} ${usedRights.has(r) ? styles.matchUsed : ""}`}
              onClick={() => pickRight(r)}
              disabled={checked || activeLeft === null}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {!checked && (
        <div className={styles.itemActions}>
          <Button variant="primary" size="sm" onClick={check} disabled={!allPicked}>
            Check matches
          </Button>
        </div>
      )}
      {checked && (
        <div className={styles.reveal}>
          <Tag tone={item.pairs.every((p, i) => picks[i] === p.right) ? "mastered" : "learning"}>
            {item.pairs.every((p, i) => picks[i] === p.right) ? "Correct" : "To revisit"}
          </Tag>
          {!item.pairs.every((p, i) => picks[i] === p.right) && (
            <ul className={styles.correctionList}>
              {item.pairs.map((p, i) => (
                <li key={i}>
                  <strong>{p.left}</strong> → {p.right}
                </li>
              ))}
            </ul>
          )}
          <CitationChip source={item.source_ref} />
        </div>
      )}
    </div>
  );
}

// ── Ordering (rearrange) ────────────────────────────────────────────────────

function OrderingRunner({
  item,
  onAnswered,
}: {
  item: Extract<TestItem, { kind: "ordering" }>;
  onAnswered: (o: ItemOutcome) => void;
}) {
  const [order, setOrder] = useState<string[]>(() => {
    // Reshuffle until the start order differs from the answer (tiny lists can
    // shuffle back to sorted, which would grade itself).
    for (let i = 0; i < 5; i++) {
      const s = shuffled(item.steps);
      if (s.some((step, j) => step !== item.steps[j])) return s;
    }
    return [...item.steps].reverse();
  });
  const [checked, setChecked] = useState(false);

  function move(index: number, delta: -1 | 1) {
    if (checked) return;
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function check() {
    if (checked) return;
    setChecked(true);
    const correct = order.every((s, i) => s === item.steps[i]);
    onAnswered({ verdict: correct ? "correct" : "incorrect", feedback: "" });
  }

  const correct = order.every((s, i) => s === item.steps[i]);

  return (
    <div className={styles.item}>
      <p className={styles.prompt}>
        <ArrowsDownUp aria-hidden="true" /> {item.instruction}
      </p>
      <ol className={styles.orderList} aria-label="Steps to order">
        {order.map((step, i) => (
          <li key={step} className={`${styles.orderStep} ${checked ? (step === item.steps[i] ? styles.optionCorrect : styles.optionRevisit) : ""}`}>
            <span className={styles.orderText}>{step}</span>
            {!checked && (
              <span className={styles.orderControls}>
                <button
                  type="button"
                  className={styles.orderBtn}
                  aria-label={`Move "${step}" up`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <CaretUp weight="bold" />
                </button>
                <button
                  type="button"
                  className={styles.orderBtn}
                  aria-label={`Move "${step}" down`}
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                >
                  <CaretDown weight="bold" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!checked && (
        <div className={styles.itemActions}>
          <Button variant="primary" size="sm" onClick={check}>
            Check order
          </Button>
        </div>
      )}
      {checked && (
        <div className={styles.reveal}>
          <Tag tone={correct ? "mastered" : "learning"}>{correct ? "Correct" : "To revisit"}</Tag>
          {!correct && (
            <ol className={styles.correctionList}>
              {item.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <CitationChip source={item.source_ref} />
        </div>
      )}
    </div>
  );
}
