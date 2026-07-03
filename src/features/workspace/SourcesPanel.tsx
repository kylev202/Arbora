import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { FilePlus, Sparkle, Stack } from "@phosphor-icons/react";
import { Button, EmptyState } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { onIngestDone, onIngestError, onIngestProgress } from "../../lib/ipc";
import type { Source } from "../../lib/types";
import { SourceRow } from "./SourceRow";
import { AddSourceModal } from "./AddSourceModal";
import { GenerateModal } from "./GenerateModal";
import shared from "./Workspace.module.css";
import styles from "./SourcesTab.module.css";

/**
 * Source-document manager, embedded as a section of the subject Overview page:
 * add materials, assign them to weeks, and start grounded generation (the
 * content pipeline entry). Rows stay live while ingest jobs run.
 */
export function SourcesPanel({ subjectId }: { subjectId: string }) {
  const navigate = useNavigate();
  const remote = useAsync(() => api.listSources(subjectId), [subjectId]);
  const outline = useAsync(() => api.getOutline(subjectId), [subjectId]);
  const [sources, setSources] = useState<Source[]>([]);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);

  const weeks = outline.data?.weeks ?? [];

  useEffect(() => {
    if (remote.status === "loaded") setSources(remote.data);
  }, [remote.status, remote.data]);

  // Optimistically assign a source to a week (or unassign); revert on failure.
  function assignWeek(source: Source, weekId: string | null) {
    const prev = source.week_id ?? null;
    setSources((cur) => cur.map((s) => (s.id === source.id ? { ...s, week_id: weekId } : s)));
    api.assignSourceWeek(source.id, weekId).catch(() =>
      setSources((cur) => cur.map((s) => (s.id === source.id ? { ...s, week_id: prev } : s))),
    );
  }

  // Keep rows live as their ingest jobs progress (also after the modal closes).
  useEffect(() => {
    const patch = (id: string, next: Partial<Source>) =>
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
    const unsubs: UnlistenFn[] = [];
    onIngestProgress((e) =>
      patch(e.source_id, { ingest_state: "processing", progress: e.progress, step: e.step }),
    ).then((u) => unsubs.push(u));
    onIngestDone((e) =>
      patch(e.source_id, { ingest_state: "processed", chunk_count: e.chunk_count, progress: undefined }),
    ).then((u) => unsubs.push(u));
    onIngestError((e) => patch(e.source_id, { ingest_state: "error", error: e.error })).then((u) =>
      unsubs.push(u),
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  function retry(s: Source) {
    setSources((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, ingest_state: "processing", error: undefined, progress: 0 } : x)),
    );
    api.ingestSource(s.id).catch((e) =>
      setSources((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, ingest_state: "error", error: String(e) } : x)),
      ),
    );
  }

  // Optimistically rename; revert the title on failure.
  function rename(source: Source, title: string) {
    const prev = source.title;
    setSources((cur) => cur.map((s) => (s.id === source.id ? { ...s, title } : s)));
    api.renameSource(source.id, title).catch(() =>
      setSources((cur) => cur.map((s) => (s.id === source.id ? { ...s, title: prev } : s))),
    );
  }

  // Optimistically remove; restore the row on failure.
  function remove(source: Source) {
    setSources((cur) => cur.filter((s) => s.id !== source.id));
    api.deleteSource(source.id).catch(() => setSources((cur) => [...cur, source]));
  }

  const processed = sources.filter((s) => s.ingest_state === "processed");
  const canGenerate = processed.length > 0;

  return (
    <section aria-label="Source documents">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Sources</h2>
        <Button
          size="sm"
          variant="secondary"
          icon={<FilePlus weight="bold" />}
          onClick={() => setAdding(true)}
        >
          Add source
        </Button>
      </div>

      {remote.status === "loading" && <div className={shared.skeletonList} aria-hidden="true" />}

      {remote.status === "loaded" && sources.length === 0 && (
        <EmptyState
          icon={<Stack />}
          title="No sources yet"
          description="Add a PDF, slide deck, or recording. Arbora indexes it so every generated note and card can cite it."
          action={
            <Button variant="primary" icon={<FilePlus weight="bold" />} onClick={() => setAdding(true)}>
              Add source
            </Button>
          }
        />
      )}

      {sources.length > 0 && (
        <>
          <ul className={shared.card}>
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                onRetry={retry}
                weeks={weeks}
                onAssignWeek={assignWeek}
                onRename={rename}
                onDelete={remove}
              />
            ))}
          </ul>

          <div className={styles.generateBar}>
            <Button
              variant="primary"
              icon={<Sparkle weight="fill" />}
              onClick={() => setGenerating(true)}
              disabled={!canGenerate}
            >
              Generate content from sources
            </Button>
            {!canGenerate && (
              <span className={styles.hint}>Add at least one processed source to generate.</span>
            )}
          </div>
        </>
      )}

      <AddSourceModal
        open={adding}
        onClose={() => setAdding(false)}
        subjectId={subjectId}
        onAdded={(s) => setSources((prev) => [...prev, s])}
      />
      <GenerateModal
        open={generating}
        onClose={() => setGenerating(false)}
        subjectId={subjectId}
        sourceIds={processed.map((s) => s.id)}
        sourceTitles={processed.map((s) => s.title)}
        onGenerated={() => {
          setGenerating(false);
          navigate(`/subject/${subjectId}/review`);
        }}
      />
    </section>
  );
}
