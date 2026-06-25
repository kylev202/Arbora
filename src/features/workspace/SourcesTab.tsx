import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FilePlus, Sparkle, Stack } from "@phosphor-icons/react";
import { Button, EmptyState } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { mockApi } from "../../mocks/api";
import { SourceRow } from "./SourceRow";
import { AddSourceModal } from "./AddSourceModal";
import { GenerateModal } from "./GenerateModal";
import shared from "./Workspace.module.css";
import styles from "./SourcesTab.module.css";

/** S-02 Sources tab — document list + add + generate (the content pipeline entry). */
export function SourcesTab() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const sources = useAsync(() => mockApi.listSources(subjectId), [subjectId]);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);

  const processed = sources.data?.filter((s) => s.ingest_state === "processed") ?? [];
  const canGenerate = processed.length > 0;

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Source documents</h1>
        <Button variant="secondary" icon={<FilePlus weight="bold" />} onClick={() => setAdding(true)}>
          Add source
        </Button>
      </div>

      {sources.status === "loading" && <div className={shared.skeletonList} aria-hidden="true" />}

      {sources.status === "loaded" && sources.data.length === 0 && (
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

      {sources.status === "loaded" && sources.data.length > 0 && (
        <>
          <ul className={shared.card}>
            {sources.data.map((s) => (
              <SourceRow key={s.id} source={s} onRetry={() => setAdding(true)} />
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

      <AddSourceModal open={adding} onClose={() => setAdding(false)} />
      <GenerateModal
        open={generating}
        onClose={() => setGenerating(false)}
        sourceTitles={processed.map((s) => s.title)}
        onGenerated={() => {
          setGenerating(false);
          navigate(`/subject/${subjectId}/review`);
        }}
      />
    </div>
  );
}
