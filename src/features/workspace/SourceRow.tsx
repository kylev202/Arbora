import { useState } from "react";
import {
  ArrowClockwise,
  Check,
  CheckCircle,
  FileDoc,
  FilePdf,
  FileText,
  Headphones,
  type Icon,
  PencilSimple,
  Presentation,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { Button, IconButton, ProgressBar, Tag } from "../../components";
import type { Source, SourceType, Week } from "../../lib/types";
import styles from "./SourceRow.module.css";

const TYPE_ICON: Record<SourceType, Icon> = {
  pdf: FilePdf,
  slide: Presentation,
  audio: Headphones,
  doc: FileDoc,
  text: FileText,
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
  onRename,
  onDelete,
}: {
  source: Source;
  onRetry?: (s: Source) => void;
  /** Weeks of the unit outline; pass to show the "assign to week" selector. */
  weeks?: Week[];
  onAssignWeek?: (source: Source, weekId: string | null) => void;
  /** Commit a new title for this source. Pass to enable inline rename. */
  onRename?: (source: Source, title: string) => void;
  /** Remove this source. Pass to enable the delete control. */
  onDelete?: (source: Source) => void;
}) {
  const TypeIcon = TYPE_ICON[source.type];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function startRename() {
    setDraft(source.title);
    setEditing(true);
  }
  function saveRename() {
    const next = draft.trim();
    if (next && next !== source.title) onRename?.(source, next);
    setEditing(false);
  }

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
          {editing ? (
            <span className={styles.editName}>
              <input
                className={styles.editInput}
                aria-label="Source name"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename();
                  if (e.key === "Escape") setEditing(false);
                }}
                onBlur={saveRename}
              />
              <IconButton label="Save name" icon={<Check />} size="sm" onMouseDown={(e) => e.preventDefault()} onClick={saveRename} />
              <IconButton label="Cancel rename" icon={<X />} size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(false)} />
            </span>
          ) : (
            <>
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
            </>
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

      {!editing && (onRename || onDelete) && (
        <div className={styles.actions}>
          {confirmingDelete ? (
            <>
              <span className={styles.confirmText}>Remove?</span>
              <Button size="sm" variant="ghost" onClick={() => onDelete?.(source)}>
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {onRename && (
                <IconButton label={`Rename ${source.title}`} icon={<PencilSimple />} size="sm" onClick={startRename} />
              )}
              {onDelete && (
                <IconButton
                  label={`Remove ${source.title}`}
                  icon={<Trash />}
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                />
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
