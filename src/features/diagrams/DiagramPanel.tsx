import { useState } from "react";
import { ArrowClockwise, TreeStructure } from "@phosphor-icons/react";
import { Button, CitationChip, EmptyState, MermaidDiagram } from "../../components";
import { api } from "../../lib/api";
import type { DiagramResponse } from "../../lib/types";
import styles from "./DiagramsScreen.module.css";

type DiagramState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: DiagramResponse }
  | { status: "error"; message: string };

function errorMessage(raw: string): string {
  if (raw.includes("NO_CHUNKS"))
    return "No indexed material for this week yet. Add sources to the week and ingest them first.";
  if (raw.includes("SIDECAR_UNAVAILABLE"))
    return "AI sidecar is not ready. Wait a moment and try again.";
  return "Couldn't build the mind map. Make sure Ollama is running and try again.";
}

/**
 * A grounded mind map of a whole week's material — one hierarchical Mermaid tree
 * that branches from the big picture down to the details, drawn only from the
 * week's indexed sources (no topic query). One click builds it; every branch is
 * traceable to a cited passage.
 */
export function DiagramPanel({ subjectId, weekId }: { subjectId: string; weekId: string }) {
  const [state, setState] = useState<DiagramState>({ status: "idle" });

  async function generate() {
    setState({ status: "loading" });
    try {
      const result = await api.generateDiagram(subjectId, weekId);
      setState({ status: "done", result });
    } catch (e: unknown) {
      setState({ status: "error", message: errorMessage(String(e)) });
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.diagramArea} aria-live="polite" aria-label="Week mind map">
        {state.status === "idle" && (
          <EmptyState
            icon={<TreeStructure />}
            title="Mind-map this week"
            description="Build one diagram of everything in this week — branching from the big picture down to the details, drawn only from your indexed sources."
            action={
              <Button variant="primary" icon={<TreeStructure weight="fill" />} onClick={generate}>
                Generate mind map
              </Button>
            }
          />
        )}

        {state.status === "loading" && (
          <div className={styles.thinking} aria-label="Building mind map…">
            <span className={styles.dot} aria-hidden />
            <span className={styles.dot} aria-hidden />
            <span className={styles.dot} aria-hidden />
          </div>
        )}

        {state.status === "error" && (
          <div className={styles.errorWrap}>
            <p className={styles.error}>{state.message}</p>
            <Button size="sm" variant="secondary" icon={<ArrowClockwise />} onClick={generate}>
              Try again
            </Button>
          </div>
        )}

        {state.status === "done" && (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <p className={styles.cardTitle}>{state.result.title}</p>
              <Button size="sm" variant="ghost" icon={<ArrowClockwise />} onClick={generate}>
                Regenerate
              </Button>
            </div>
            <MermaidDiagram
              code={state.result.mermaid_code}
              className={styles.diagram}
              label={state.result.title}
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
