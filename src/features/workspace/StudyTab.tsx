import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import { Export, GraduationCap, Lightning, Play, Timer } from "@phosphor-icons/react";
import { Button, EmptyState, StatTile } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { PathTrack } from "./PathTrack";
import styles from "./StudyTab.module.css";

/** S-02 Study tab — calm start screen. Starting a session is a single click. */
export function StudyTab() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const stats = useAsync(() => api.getStudyStats(subjectId), [subjectId]);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const start = () => navigate(`/subject/${subjectId}/study/session`);
  const startQuick = () => navigate(`/subject/${subjectId}/study/session?limit=5`);
  const startTimed = () => navigate(`/subject/${subjectId}/study/session?timer=10`);

  async function exportDeck() {
    setExportMsg(null);
    const path = await save({
      defaultPath: "arbora-deck.apkg",
      filters: [{ name: "Anki deck", extensions: ["apkg"] }],
    });
    if (!path) return; // cancelled
    setExporting(true);
    try {
      const result = await api.exportApkg(subjectId, path);
      setExportMsg(`Exported ${result.card_count} approved card${result.card_count === 1 ? "" : "s"} to Anki.`);
    } catch (e) {
      setExportMsg(
        String(e).includes("NO_CARDS_TO_EXPORT")
          ? "No approved cards to export yet — approve some in the review gate first."
          : "Export failed. Make sure the AI sidecar is running and try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (stats.status === "loading") {
    return (
      <div className="page">
        <div className="screen-header">
          <h1>Study</h1>
        </div>
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  const dueToday = stats.data?.due_today ?? 0;

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Study</h1>
        <Button variant="ghost" size="sm" icon={<Export />} onClick={exportDeck} disabled={exporting}>
          {exporting ? "Exporting…" : "Export to Anki"}
        </Button>
      </div>

      {exportMsg && (
        <p className={styles.exportMsg} role="status">
          {exportMsg}
        </p>
      )}

      <PathTrack subjectId={subjectId} />

      {dueToday === 0 ? (
        <EmptyState
          icon={<span aria-hidden="true">🌱</span>}
          title="All done for today"
          description="Nothing is due right now. Rest is part of learning — your tree keeps its size."
        />
      ) : (
        <div className={styles.start}>
          <div className={styles.headline}>
            <GraduationCap weight="fill" className={styles.icon} aria-hidden="true" />
            <p className={styles.count}>
              <strong>{dueToday}</strong> cards due today
            </p>
          </div>

          <div className={styles.actions}>
            <Button variant="primary" size="md" icon={<Play weight="fill" />} onClick={start}>
              Start studying
            </Button>
            <Button variant="secondary" icon={<Timer />} onClick={startTimed}>
              10-minute focus
            </Button>
            <Button variant="secondary" icon={<Lightning />} onClick={startQuick}>
              Quick 5
            </Button>
          </div>

          <div className={styles.stats}>
            <StatTile value={stats.data?.due_this_week ?? 0} label="Due this week" tone="muted" />
            <StatTile value={stats.data?.mastered ?? 0} label="Mastered" tone="mastered" />
            <StatTile value={`${stats.data?.streak ?? 0}d`} label="Streak" tone="muted" />
          </div>
        </div>
      )}
    </div>
  );
}
