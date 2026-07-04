import { ArrowSquareOut, FileText } from "@phosphor-icons/react";
import type { SourceRef } from "../lib/types";
import { useSourceViewer } from "../features/drive/SourceViewerProvider";
import styles from "./CitationChip.module.css";

export type CitationChipProps = {
  source: SourceRef;
  /** Opens the source at the cited page/timestamp. Defaults to the shared source
   * viewer (opens the document and flashes the cited phrase). */
  onOpen?: (source: SourceRef) => void;
};

function formatLocation(loc: SourceRef["location"]): string {
  if (loc.type === "page") return `p.${loc.page}`;
  const totalSec = Math.floor(loc.timestamp_ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Clickable citation (Law #1: grounding is always visible + traceable). Renders
 * source · location · excerpt and opens the source on click. AA-contrast tokens.
 */
export function CitationChip({ source, onOpen }: CitationChipProps) {
  const viewer = useSourceViewer();
  const open = onOpen ?? viewer?.openSource;
  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => open?.(source)}
      title={`Open ${source.source_title} at ${formatLocation(source.location)}`}
    >
      <FileText className={styles.lead} aria-hidden="true" />
      <span className={styles.loc}>
        {source.source_title} · {formatLocation(source.location)}
      </span>
      <span className={styles.excerpt}>“{source.excerpt}”</span>
      <ArrowSquareOut className={styles.open} aria-hidden="true" />
    </button>
  );
}
