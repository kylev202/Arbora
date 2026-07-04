import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FileX, X } from "@phosphor-icons/react";
// Import primitives directly (not the barrel) to avoid a module cycle:
// components/index → CitationChip → SourceViewerProvider → SourceViewer.
import { IconButton } from "../../components/IconButton";
import { api } from "../../lib/api";
import type { Source, SourceChunk } from "../../lib/types";
import type { ViewerTarget } from "./SourceViewerProvider";
import styles from "./SourceViewer.module.css";

function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** How to show a file's original bytes in the webview. `text` covers plain text
 * we can drop straight into an iframe; `unsupported` (docx/pptx) has no native
 * renderer, so we fall back to the extracted text. */
type Mode = "pdf" | "image" | "audio" | "video" | "text" | "unsupported";

function extension(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "";
}

function renderMode(source: Source): Mode {
  switch (extension(source.file_path)) {
    case "pdf":
      return "pdf";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "bmp":
    case "svg":
    case "avif":
      return "image";
    case "mp3":
    case "m4a":
    case "wav":
    case "ogg":
    case "flac":
    case "aac":
      return "audio";
    case "mp4":
    case "webm":
    case "mov":
    case "mkv":
    case "avi":
    case "ogv":
      return "video";
    case "txt":
    case "md":
    case "markdown":
      return "text";
    default:
      return "unsupported";
  }
}

/** Wrap the cited phrase (verbatim source text) so the fallback reader can flash
 * it. Exact substring match; a miss just renders plain (we still scroll). */
function renderWithFlash(text: string, needle: string | undefined, page: number | null, targetPage: number | null | undefined): ReactNode[] {
  if (!needle || (targetPage != null && targetPage !== page)) return [text];
  const at = text.indexOf(needle);
  if (at < 0) return [text];
  return [
    text.slice(0, at),
    <mark key="flash" className={styles.flash}>
      {text.slice(at, at + needle.length)}
    </mark>,
    text.slice(at + needle.length),
  ];
}

/**
 * Full-height reader that shows a source's ORIGINAL file (the raw PDF, image,
 * audio, video, or text) exactly as uploaded — nothing re-rendered or re-flowed.
 * Opened from Drive or from a grounded citation; a cited PDF jumps to its page.
 * Formats the webview can't render natively (docx/pptx) fall back to the
 * extracted text so the source is still readable. No AI, no network.
 */
export function SourceViewer({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  const [source, setSource] = useState<Source | null | "error">(null);
  const [chunks, setChunks] = useState<SourceChunk[] | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Resolve the source's original path + type.
  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setChunks(null);
    api.getSource(target.sourceId).then((s) => !cancelled && setSource(s)).catch(() => !cancelled && setSource("error"));
    return () => {
      cancelled = true;
    };
  }, [target.sourceId]);

  const resolved = source && source !== "error" ? source : null;
  const mode = resolved ? renderMode(resolved) : null;
  const assetUrl = resolved ? convertFileSrc(resolved.file_path) : "";

  // Only formats we can't embed need the extracted text.
  useEffect(() => {
    if (mode !== "unsupported") return;
    let cancelled = false;
    api.getSourceChunks(target.sourceId).then((c) => !cancelled && setChunks(c)).catch(() => !cancelled && setChunks([]));
    return () => {
      cancelled = true;
    };
  }, [mode, target.sourceId]);

  // In the fallback reader, scroll to (and flash) the cited phrase/page.
  useLayoutEffect(() => {
    if (mode !== "unsupported" || !chunks) return;
    const el =
      contentRef.current?.querySelector<HTMLElement>(`.${styles.flash}`) ??
      (target.page != null
        ? contentRef.current?.querySelector<HTMLElement>(`[data-page="${target.page}"]`)
        : null);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [mode, chunks, target.page, target.highlightQuote]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pdfUrl = target.page != null ? `${assetUrl}#page=${target.page}` : assetUrl;
  const title = target.sourceTitle ?? resolved?.title ?? "Source";

  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose}>
      <aside
        className={`${styles.drawer} glass-strong`}
        role="dialog"
        aria-label={`Source: ${title}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <IconButton label="Close" icon={<X />} size="sm" onClick={onClose} />
        </header>

        <div className={styles.body} ref={contentRef}>
          {source === null && <p className={styles.muted}>Loading…</p>}
          {source === "error" && <p className={styles.muted}>Couldn't open this source.</p>}

          {mode === "pdf" && <iframe className={styles.frame} src={pdfUrl} title={title} />}
          {mode === "text" && <iframe className={styles.frame} src={assetUrl} title={title} />}
          {mode === "image" && (
            <div className={styles.mediaWrap}>
              <img className={styles.image} src={assetUrl} alt={title} />
            </div>
          )}
          {mode === "audio" && (
            <div className={styles.mediaWrap}>
              <audio className={styles.audio} src={assetUrl} controls />
            </div>
          )}
          {mode === "video" && (
            <div className={styles.mediaWrap}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video className={styles.video} src={assetUrl} controls />
            </div>
          )}

          {mode === "unsupported" && (
            <div className={styles.fallback}>
              <div className={styles.fallbackNote}>
                <FileX aria-hidden="true" />
                <span>This format has no built-in preview — showing the extracted text.</span>
              </div>
              {chunks === null && <p className={styles.muted}>Loading…</p>}
              {chunks?.length === 0 && (
                <p className={styles.muted}>No extracted text yet. Process this source to read it here.</p>
              )}
              {chunks?.map((c, i) => (
                <div key={i} className={styles.chunk} data-page={c.page ?? "null"}>
                  <span className={styles.chunkLoc}>
                    {c.page != null
                      ? `Page ${c.page}`
                      : c.timestamp_ms != null
                        ? formatTimestamp(c.timestamp_ms)
                        : `Section ${i + 1}`}
                  </span>
                  <p className={styles.chunkText}>
                    {renderWithFlash(c.text, target.highlightQuote, c.page, target.page)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
