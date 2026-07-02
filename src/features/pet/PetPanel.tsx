import { useEffect, useRef, useState } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { ArrowRight, Minus } from "@phosphor-icons/react";
import { CitationChip, Disclaimer, IconButton } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { PetReply, SchedulePlan, SourceRef } from "../../lib/types";
import { startOfWeek, toNaive } from "../calendar/dates";
import { ScheduleProposalCard } from "../calendar/ScheduleProposalCard";
import type { PetState } from "./Pet";
import styles from "./PetPanel.module.css";

type Turn =
  | { status: "loading"; question: string }
  | { status: "done"; question: string; text: string; citations: SourceRef[] }
  | { status: "plan"; question: string; intro: string; plan: SchedulePlan }
  | { status: "error"; question: string; error: string };

/** Calm copy for every non-answer reply kind (refusals are gentle, law #1). */
function replyText(reply: PetReply): string {
  switch (reply.kind) {
    case "answer":
      return reply.answer;
    case "needs_subject":
      return "Pick a subject above so I can search your material for this.";
    case "no_material":
      return "That subject has no indexed material yet. Add a source and I can help.";
    case "schedule_request":
      // Normally intercepted before this; kept for exhaustiveness.
      return "Let me sketch a plan for your week…";
    case "refusal":
      return "I can only help with your study material and with using Arbora 🌱";
  }
}

function errorText(raw: string): string {
  if (raw.includes("OLLAMA_UNAVAILABLE") || raw.includes("SIDECAR_UNAVAILABLE"))
    return "I'm still getting ready… give me a moment and try again.";
  return "Something went wrong answering that. Try again in a moment.";
}

/**
 * The pet's chat panel (§1.3): grounded lesson answers with citations, app-help
 * answers (slice C), gentle refusals outside those two domains. Esc closes.
 */
export function PetPanel({
  anchor,
  ollamaReady,
  onClose,
  onStateChange,
}: {
  anchor: { left: number; top: number };
  ollamaReady: boolean;
  onClose: () => void;
  onStateChange: (state: PetState) => void;
}) {
  const location = useLocation();
  const routeSubject =
    matchPath("/subject/:subjectId/*", location.pathname)?.params.subjectId ?? null;

  const subjects = useAsync(() => api.listSubjects(), []);
  const [chosenSubject, setChosenSubject] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const subjectId = chosenSubject ?? routeSubject;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Panel opens to the side that has room, above the avatar if space allows.
  const openLeft = anchor.left > window.innerWidth / 2;
  const style: React.CSSProperties = {
    [openLeft ? "right" : "left"]: openLeft
      ? window.innerWidth - anchor.left - 52
      : anchor.left,
    bottom: Math.max(window.innerHeight - anchor.top + 12, 12),
  };

  async function submit() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    onStateChange("thinking");

    const idx = turns.length;
    setTurns((prev) => [...prev, { status: "loading", question: q }]);

    try {
      const reply = await api.petMessage(q, subjectId);
      if (reply.kind === "schedule_request") {
        // The pet announces what it did BEFORE showing the confirm cards (§1.4);
        // nothing touches the calendar until the user accepts (law #2).
        const weekStart = toNaive(startOfWeek(new Date())).split("T")[0];
        const plan = await api.proposeSchedule(weekStart);
        const count = plan.sessions.length + plan.moves.length;
        setTurns((prev) => {
          const next = [...prev];
          next[idx] =
            count === 0
              ? {
                  status: "done",
                  question: q,
                  text: "I couldn't find free study windows this week. Set your weekly windows in Settings and I'll plan around them 🌱",
                  citations: [],
                }
              : {
                  status: "plan",
                  question: q,
                  intro: `I've sketched ${count} suggestion${count === 1 ? "" : "s"} for this week from your free windows 🌱 Want to add them?`,
                  plan,
                };
          return next;
        });
      } else {
        setTurns((prev) => {
          const next = [...prev];
          next[idx] = {
            status: "done",
            question: q,
            text: replyText(reply),
            citations: reply.kind === "answer" ? reply.citations : [],
          };
          return next;
        });
      }
      onStateChange("speaking");
      setTimeout(() => onStateChange("idle"), 2000);
    } catch (e) {
      setTurns((prev) => {
        const next = [...prev];
        next[idx] = { status: "error", question: q, error: errorText(String(e)) };
        return next;
      });
      onStateChange("idle");
    } finally {
      setBusy(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  type PlanPick = { session?: number; move?: number; times?: { start_at: string; end_at: string } };

  /** Shrink a plan turn after one card is handled; when empty, the pet
   * confirms out loud ("Added!" behaviour, §1.4). */
  function shrinkPlan(turnIndex: number, pick: PlanPick, accepted: boolean) {
    setTurns((prev) => {
      const next = [...prev];
      const turn = next[turnIndex];
      if (turn.status !== "plan") return prev;
      const plan = {
        sessions: turn.plan.sessions.filter((_, j) => j !== pick.session),
        moves: turn.plan.moves.filter((_, j) => j !== pick.move),
      };
      if (plan.sessions.length + plan.moves.length === 0) {
        next[turnIndex] = {
          status: "done",
          question: turn.question,
          text: accepted ? "Added to your calendar 🌱" : "Okay, leaving those out.",
          citations: [],
        };
      } else {
        next[turnIndex] = { ...turn, plan };
      }
      return next;
    });
  }

  async function acceptFromTurn(turnIndex: number, pick: PlanPick) {
    const turn = turns[turnIndex];
    if (turn.status !== "plan") return;
    if (pick.session !== undefined) {
      const s = { ...turn.plan.sessions[pick.session], ...pick.times };
      await api.acceptSchedule([s], []);
    } else if (pick.move !== undefined) {
      const m = { ...turn.plan.moves[pick.move], ...pick.times };
      await api.acceptSchedule([], [m]);
    }
    shrinkPlan(turnIndex, pick, true);
  }

  function dismissFromTurn(turnIndex: number, pick: PlanPick) {
    shrinkPlan(turnIndex, pick, false);
  }

  return (
    <div
      className={styles.panel}
      style={style}
      role="dialog"
      aria-label="Pet chat"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <span className={styles.title}>Your study companion</span>
        <div className={styles.headerRight}>
          {!ollamaReady && (
            <span className={styles.gettingReady} role="status">
              getting ready…
            </span>
          )}
          <IconButton label="Minimize chat" icon={<Minus />} size="sm" onClick={onClose} />
        </div>
      </header>

      {subjects.status === "loaded" && subjects.data.length > 0 && (
        <label className={styles.subjectRow}>
          <span className={styles.subjectLabel}>Subject</span>
          <select
            className={styles.subjectSelect}
            value={subjectId ?? ""}
            onChange={(e) => setChosenSubject(e.target.value || null)}
          >
            <option value="">None picked</option>
            {subjects.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={styles.messages} aria-live="polite" aria-label="Pet conversation">
        {turns.length === 0 && (
          <p className={styles.hint}>
            Ask about your study material, or how to use Arbora. Answers from your material always
            carry citations.
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={styles.turn}>
            <p className={styles.question}>{turn.question}</p>
            {turn.status === "loading" && (
              <div className={styles.thinking} aria-label="Thinking…" role="status">
                <span />
                <span />
                <span />
              </div>
            )}
            {turn.status === "error" && (
              <p className={styles.error} role="alert">
                {turn.error}
              </p>
            )}
            {turn.status === "done" && (
              <div className={styles.answer}>
                <p className={styles.answerText}>{turn.text}</p>
                {turn.citations.length > 0 && (
                  <div className={styles.citations}>
                    {turn.citations.map((c, j) => (
                      <CitationChip key={j} source={c} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {turn.status === "plan" && (
              <div className={styles.answer}>
                <p className={styles.answerText}>{turn.intro}</p>
                <div className={styles.planCards}>
                  {turn.plan.moves.map((m, j) => (
                    <ScheduleProposalCard
                      key={`m-${m.event_id}`}
                      proposal={{ ...m, isMove: true }}
                      onAccept={(times) => void acceptFromTurn(i, { move: j, times })}
                      onDismiss={() => dismissFromTurn(i, { move: j })}
                    />
                  ))}
                  {turn.plan.sessions.map((s, j) => (
                    <ScheduleProposalCard
                      key={`s-${j}-${s.start_at}`}
                      proposal={s}
                      onAccept={(times) => void acceptFromTurn(i, { session: j, times })}
                      onDismiss={() => dismissFromTurn(i, { session: j })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <Disclaimer>AI can be wrong — check the sources.</Disclaimer>

      <form
        className={styles.inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ollamaReady ? "Ask me something…" : "Getting ready…"}
          aria-label="Message for the pet"
          disabled={busy}
        />
        <button
          className={styles.send}
          type="submit"
          disabled={!input.trim() || busy || !ollamaReady}
          aria-label="Send"
        >
          <ArrowRight weight="bold" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
