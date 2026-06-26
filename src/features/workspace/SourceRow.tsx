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
import type { Source, SourceType, Week } from "../../lib/types";
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
export function SourceRow({
  source,
  onRetry,
  weeks,
  onAssignWeek,
}: {
  source: Source;
  onRetry?: (s: Source) => void;
  /** Weeks of the unit outline; pass to show the "assign to week" selector. */
  weeks?: Week[];
  onAssignWeek?: (source: Source, weekId: string | null) => void;
}) {
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

        {weeks && weeks.length > 0 && onAssignWeek && (
          <label className={styles.weekAssign}>
            <span className={styles.weekAssignLabel}>Week</span>
            <select
              className={styles.weekSelect}
              value={source.week_id ?? ""}
              onChange={(e) => onAssignWeek(source, e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  Week {w.week_number}
                  {w.title ? ` · ${w.title}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

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
