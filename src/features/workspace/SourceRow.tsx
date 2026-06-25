import {
  ArrowClockwise,
  CheckCircle,
  FilePdf,
  Headphones,
  type Icon,
  Presentation,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button, ProgressBar, Tag } from "../../components";
import type { Source, SourceType } from "../../lib/types";
import styles from "./SourceRow.module.css";

const TYPE_ICON: Record<SourceType, Icon> = {
  pdf: FilePdf,
  slide: Presentation,
  audio: Headphones,
};

const STEP_LABEL: Record<string, string> = {
  parsing: "Parsing…",
  transcribing: "Transcribing…",
  chunking: "Chunking text…",
  embedding: "Indexing chunks…",
};

/**
 * One document in the Sources list (S-02). Renders its ingest state:
 * queued · processing (live progress) · processed · error (with retry).
 */
export function SourceRow({ source, onRetry }: { source: Source; onRetry?: (s: Source) => void }) {
  const TypeIcon = TYPE_ICON[source.type];

  const subtitle =
    source.ingest_state === "processed"
      ? [source.page_count && `${source.page_count} ${source.type === "audio" ? "min" : "pages"}`, source.chunk_count && `${source.chunk_count} chunks`]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <li className={styles.row}>
      <span className={styles.icon} aria-hidden="true">
        <TypeIcon weight="regular" />
      </span>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{source.title}</span>
          {source.ingest_state === "processed" && (
            <Tag tone="mastered" icon={<CheckCircle weight="fill" />}>
              Processed
            </Tag>
          )}
          {source.ingest_state === "queued" && <Tag tone="neutral">Queued</Tag>}
          {source.ingest_state === "error" && (
            <Tag tone="info" icon={<WarningCircle weight="fill" />}>
              Needs attention
            </Tag>
          )}
        </div>

        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}

        {source.ingest_state === "processing" && (
          <div className={styles.progress} aria-live="polite">
            <ProgressBar
              value={source.progress}
              label={STEP_LABEL[source.step ?? ""] ?? "Processing…"}
            />
          </div>
        )}

        {source.ingest_state === "error" && (
          <div className={styles.error}>
            <p className={styles.errorText}>{source.error}</p>
            {onRetry && (
              <Button
                size="sm"
                icon={<ArrowClockwise />}
                onClick={() => onRetry(source)}
              >
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
