import { useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Shapes } from "@phosphor-icons/react";
import { CitationChip, EmptyState, IconButton, Input, MermaidDiagram } from "../../components";
import { api } from "../../lib/api";
import type { DiagramResponse } from "../../lib/types";
import styles from "./DiagramsScreen.module.css";

type DiagramState =
  | { status: "idle" }
  | { status: "loading"; topic: string }
  | { status: "done"; topic: string; result: DiagramResponse }
  | { status: "error"; topic: string; message: string };

function errorMessage(raw: string): string {
  if (raw.includes("NO_CHUNKS"))
    return "No indexed material yet. Add sources and ingest them first.";
  if (raw.includes("SIDECAR_UNAVAILABLE"))
    return "AI sidecar is not ready. Wait a moment and try again.";
  return "Couldn't generate a diagram. Make sure Ollama is running and try again.";
}

/** S-Diagrams — AI generates a Mermaid diagram from indexed sources. */
export function DiagramsScreen() {
  const { subjectId = "" } = useParams();
  const [state, setState] = useState<DiagramState>({ status: "idle" });
  const [input, setInput] = useState("");

  async function submit() {
    const topic = input.trim();
    if (!topic || state.status === "loading") return;
    setState({ status: "loading", topic });
    try {
      const result = await api.generateDiagram(subjectId, topic);
      setState({ status: "done", topic, result });
    } catch (e: unknown) {
      setState({ status: "error", topic, message: errorMessage(String(e)) });
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.inputRow}>
        <Input
          className={styles.input}
          placeholder="What do you want to visualize? (e.g. cell respiration)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          aria-label="Diagram topic"
          disabled={state.status === "loading"}
        />
        <IconButton
          label="Generate diagram"
          icon={<ArrowRight weight="bold" />}
          size="md"
          onClick={submit}
          disabled={!input.trim() || state.status === "loading"}
        />
      </div>

      <div className={styles.diagramArea} aria-live="polite" aria-label="Diagram output">
        {state.status === "idle" && (
          <EmptyState
            icon={<Shapes />}
            title="Visualise your notes"
            description="Type a topic above to generate a concept diagram from your indexed sources."
          />
        )}

        {state.status === "loading" && (
          <div className={styles.thinking} aria-label="Generating diagram…">
            <span className={styles.dot} aria-hidden />
            <span className={styles.dot} aria-hidden />
            <span className={styles.dot} aria-hidden />
          </div>
        )}

        {state.status === "error" && (
          <p className={styles.error}>{state.message}</p>
        )}

        {state.status === "done" && (
          <div className={styles.card}>
            <p className={styles.cardTitle}>{state.result.title}</p>
            <MermaidDiagram
              code={state.result.mermaid_code}
              className={styles.diagram}
            />
            {state.result.citations.length > 0 && (
              <div className={styles.citations}>
                {state.result.citations.map((c) => (
                  <CitationChip key={`${c.source_id}-${JSON.stringify(c.location)}`} source={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
