import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SourceRef } from "../../lib/types";
import { SourceViewer } from "./SourceViewer";

/** What the viewer opens to: a source, optionally jumped to a page + a phrase to
 * flash (the citation-click behaviour). */
export type ViewerTarget = {
  sourceId: string;
  sourceTitle?: string;
  page?: number | null;
  highlightQuote?: string;
};

type ViewerApi = {
  /** Open a source from a grounded citation — jumps to the cited page and flashes the excerpt. */
  openSource: (ref: SourceRef) => void;
  /** Open a source directly (Drive page). */
  openSourceById: (target: ViewerTarget) => void;
};

const Ctx = createContext<ViewerApi | null>(null);

/** Access the shared source viewer. Returns null outside the provider (callers
 * fall back gracefully — e.g. CitationChip keeps its own onOpen). */
export function useSourceViewer(): ViewerApi | null {
  return useContext(Ctx);
}

/**
 * Mounts one shared SourceViewer for the whole app and exposes `openSource`, so
 * any grounded citation anywhere can open its source at the cited spot without
 * each call site wiring a viewer (law #1 — grounding is always traceable).
 */
export function SourceViewerProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ViewerTarget | null>(null);

  const api = useMemo<ViewerApi>(
    () => ({
      openSourceById: (t) => setTarget(t),
      openSource: (ref) =>
        setTarget({
          sourceId: ref.source_id,
          sourceTitle: ref.source_title,
          page: ref.location.type === "page" ? ref.location.page : null,
          highlightQuote: ref.excerpt,
        }),
    }),
    [],
  );

  const close = useCallback(() => setTarget(null), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {target && <SourceViewer target={target} onClose={close} />}
    </Ctx.Provider>
  );
}
