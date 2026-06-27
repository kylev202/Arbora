import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Brain } from "@phosphor-icons/react";
import { CitationChip, Disclaimer, EmptyState } from "../../components";
import { api } from "../../lib/api";
import type { SourceRef } from "../../lib/types";
import styles from "./ChatScreen.module.css";

type Turn =
  | { status: "loading"; question: string }
  | { status: "done"; question: string; answer: string; citations: SourceRef[] }
  | { status: "error"; question: string; error: string };

function errorMessage(raw: string): string {
  if (raw.includes("NO_CHUNKS"))
    return "No indexed material yet — add sources and ingest them first.";
  if (raw.includes("SIDECAR_UNAVAILABLE"))
    return "AI sidecar is not ready. Wait a moment and try again.";
  return "Couldn't get an answer. Make sure Ollama is running and try again.";
}

/** S-Ask — RAG Q&A grounded in the subject's indexed sources. */
export function ChatScreen() {
  const { subjectId = "" } = useParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function submit() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);

    const idx = turns.length;
    setTurns((prev) => [...prev, { status: "loading", question: q }]);

    try {
      const resp = await api.chatMessage(subjectId, q);
      setTurns((prev) => {
        const next = [...prev];
        next[idx] = { status: "done", question: q, answer: resp.answer, citations: resp.citations };
        return next;
      });
    } catch (e) {
      setTurns((prev) => {
        const next = [...prev];
        next[idx] = { status: "error", question: q, error: errorMessage(String(e)) };
        return next;
      });
    } finally {
      setBusy(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className={styles.screen}>
      <div className="screen-header">
        <h1>Ask</h1>
      </div>

      <Disclaimer>
        Answers are generated from your sources only — always verify important details.
      </Disclaimer>

      <div className={styles.messages} aria-live="polite" aria-label="Conversation">
        {turns.length === 0 && (
          <EmptyState
            icon={<Brain />}
            title="Ask anything"
            description="Questions are answered using only your subject's indexed sources."
          />
        )}

        {turns.map((turn, i) => (
          <div key={i} className={styles.turn}>
            <p className={styles.question}>{turn.question}</p>

            {turn.status === "loading" && (
              <div className={styles.thinking} aria-label="Thinking…" role="status">
                <span /><span /><span />
              </div>
            )}

            {turn.status === "error" && (
              <p className={styles.error} role="alert">{turn.error}</p>
            )}

            {turn.status === "done" && (
              <div className={styles.answer}>
                <p className={styles.answerText}>{turn.answer}</p>
                {turn.citations.length > 0 && (
                  <div className={styles.citations}>
                    {turn.citations.map((c, j) => (
                      <CitationChip key={j} source={c} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <form
        className={styles.inputRow}
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <input
          className={styles.input}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your sources…"
          aria-label="Question"
          disabled={busy}
        />
        <button
          className={styles.send}
          type="submit"
          disabled={!input.trim() || busy}
          aria-label="Send question"
        >
          <ArrowRight weight="bold" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
