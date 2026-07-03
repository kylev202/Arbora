import { useState } from "react";
import { useParams } from "react-router-dom";
import { Graph } from "@phosphor-icons/react";
import { Button, EmptyState, SproutLoader } from "../../components";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import type { ConceptEntry, ConceptMastery } from "../../lib/types";
import styles from "./KnowledgeMapScreen.module.css";

const MASTERY_LABEL: Record<ConceptMastery, string> = {
  mastered: "Mastered",
  learning: "In progress",
  unstarted: "Not started",
};

function sourceLabel(entry: ConceptEntry): string {
  if (entry.page != null) return `${entry.source_title} · p. ${entry.page}`;
  if (entry.timestamp_ms != null) {
    const s = Math.floor(entry.timestamp_ms / 1000);
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${entry.source_title} · ${mm}:${ss}`;
  }
  return entry.source_title;
}

/** A single concept tile — click to reveal the answer (card back). */
function ConceptTile({ entry }: { entry: ConceptEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      className={styles.tile}
      data-mastery={entry.mastery}
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      aria-label={`${entry.concept}, ${MASTERY_LABEL[entry.mastery]}`}
    >
      <div className={styles.tileHeader}>
        <span className={styles.masteryDot} data-mastery={entry.mastery} aria-hidden />
        <span className={styles.concept}>{entry.concept}</span>
      </div>
      {expanded && <p className={styles.back}>{entry.back}</p>}
      <p className={styles.source}>{sourceLabel(entry)}</p>
    </button>
  );
}

/** S-Map — all approved concepts for a subject, coloured by mastery state. */
export function KnowledgeMapScreen() {
  const { subjectId = "" } = useParams();
  const map = useAsync(() => api.getKnowledgeMap(subjectId), [subjectId]);

  if (map.status === "error") {
    return (
      <div className={styles.screen}>
        <EmptyState
          icon={<Graph />}
          title="Couldn't load map"
          description={map.error.message}
          action={
            <Button variant="secondary" onClick={map.retry}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (map.status === "loading") {
    return (
      <div className={styles.screen}>
        <SproutLoader label="Fetching your concepts…" />
      </div>
    );
  }

  const entries = map.data;

  if (entries.length === 0) {
    return (
      <div className={styles.screen}>
        <EmptyState
          icon={<Graph />}
          title="No concepts yet"
          description="Generate and approve flashcards to see them here."
        />
      </div>
    );
  }

  const mastered = entries.filter((e) => e.mastery === "mastered").length;
  const learning = entries.filter((e) => e.mastery === "learning").length;
  const unstarted = entries.filter((e) => e.mastery === "unstarted").length;

  return (
    <div className={styles.screen}>
      <div className={styles.summary} role="status" aria-live="polite">
        <span className={styles.pill}>
          <span className={styles.pillDot} data-mastery="mastered" aria-hidden />
          {mastered} mastered
        </span>
        <span className={styles.pill}>
          <span className={styles.pillDot} data-mastery="learning" aria-hidden />
          {learning} in progress
        </span>
        <span className={styles.pill}>
          <span className={styles.pillDot} data-mastery="unstarted" aria-hidden />
          {unstarted} not started
        </span>
      </div>

      <div
        className={styles.grid}
        role="list"
        aria-label="Concept map"
      >
        {entries.length === 0 && (
          <p className={styles.empty}>No approved cards yet.</p>
        )}
        {entries.map((entry) => (
          <div key={entry.id} role="listitem">
            <ConceptTile entry={entry} />
          </div>
        ))}
      </div>
    </div>
  );
}
