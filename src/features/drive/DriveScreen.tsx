import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  ArrowSquareOut,
  CaretRight,
  DotsThreeVertical,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrives,
  PencilSimple,
  Plus,
  Sparkle,
  Trash,
} from "@phosphor-icons/react";
import { Button, EmptyState, IconButton, Input, Modal, Select } from "../../components";
import { usePopover } from "../../components/usePopover";
import { TopBar } from "../../app/shell/TopBar";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { onIngestDone, onIngestError, onIngestProgress } from "../../lib/ipc";
import type { Source, Subject, Week } from "../../lib/types";
import { AddSourceModal } from "../workspace/AddSourceModal";
import { useSourceViewer } from "./SourceViewerProvider";
import { useDriveOrg, type OrgFolder } from "./driveOrg";
import styles from "./DriveScreen.module.css";

/** Left-rail selection: "all", a subject id, or a front-end folder (`folder:<id>`). */
type FolderKey = string;

const STATE_LABEL: Record<Source["ingest_state"], string> = {
  queued: "Queued",
  processing: "Processing…",
  processed: "Ready",
  error: "Failed",
};

/**
 * Drive: a OneDrive-style file manager over the subject sources. Subjects and the
 * user's folders live in ONE tree: each subject is a top-level folder (it can't be
 * renamed — it scopes the AI index, law #1) and under it the user nests their own
 * folders; they can also make personal folders (no subject) and drag files around
 * however they like. That whole folder arrangement is a purely front-end layer
 * (see driveOrg) — the backend still treats every file as belonging to its subject,
 * one group. Opening a folder shows its subfolders and files; opening a file shows
 * the raw document.
 */
export function DriveScreen() {
  const navigate = useNavigate();
  const viewer = useSourceViewer();
  const org = useDriveOrg();
  const subjectsReq = useAsync(() => api.listSubjects(), []);
  const subjects: Subject[] = subjectsReq.data ?? [];

  const [folder, setFolder] = useState<FolderKey>("all");
  const [sources, setSources] = useState<Source[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [folderModal, setFolderModal] = useState<
    { mode: "create"; subjectId: string | null; parentId: string | null } | { mode: "rename"; folder: OrgFolder } | null
  >(null);
  const didDefault = useRef(false);

  const folderById = useMemo(() => new Map(org.folders.map((f) => [f.id, f])), [org.folders]);

  const isAll = folder === "all";
  const isUserFolder = folder.startsWith("folder:");
  const activeFolderId = isUserFolder ? folder.slice("folder:".length) : null;
  const activeFolder = activeFolderId ? folderById.get(activeFolderId) ?? null : null;
  const activeSubjectId = isAll ? null : isUserFolder ? activeFolder?.subjectId ?? null : folder;

  // A selected folder that got deleted (or whose ancestor did) → fall back to All.
  useEffect(() => {
    if (isUserFolder && !activeFolder) setFolder("all");
  }, [isUserFolder, activeFolder]);

  // Open into the first subject on first load (a real folder beats "All"), but
  // never fight the user once they've navigated — including back to "All files".
  useEffect(() => {
    if (!didDefault.current && folder === "all" && subjects.length > 0) {
      didDefault.current = true;
      setFolder(subjects[0].id);
    }
  }, [subjects, folder]);

  // Load files: a subject (or one of its folders) loads that subject's files + its
  // weeks; "All files" and personal folders load every subject's files, no weeks.
  useEffect(() => {
    let cancelled = false;
    const done = (list: Source[]) => !cancelled && setSources(list);
    if (activeSubjectId) {
      api.listSources(activeSubjectId).then(done).catch(() => done([]));
      api.getOutline(activeSubjectId).then((o) => !cancelled && setWeeks(o.weeks)).catch(() => !cancelled && setWeeks([]));
    } else {
      setWeeks([]);
      if (subjects.length === 0) {
        setSources([]);
        return;
      }
      Promise.all(subjects.map((s) => api.listSources(s.id)))
        .then((lists) => done(lists.flat()))
        .catch(() => done([]));
    }
    return () => {
      cancelled = true;
    };
  }, [activeSubjectId, subjects]);

  // Keep rows live while ingest jobs run.
  useEffect(() => {
    const patch = (id: string, next: Partial<Source>) =>
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
    const unsubs: UnlistenFn[] = [];
    onIngestProgress((e) => patch(e.source_id, { ingest_state: "processing", progress: e.progress, step: e.step })).then((u) => unsubs.push(u));
    onIngestDone((e) => patch(e.source_id, { ingest_state: "processed", chunk_count: e.chunk_count })).then((u) => unsubs.push(u));
    onIngestError((e) => patch(e.source_id, { ingest_state: "error", error: e.error })).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Folder tree (front-end overlay) ──
  const rootBySubject = useMemo(() => {
    const m = new Map<string | null, OrgFolder[]>();
    for (const f of org.folders) {
      if (f.parentId !== null) continue;
      if (!m.has(f.subjectId)) m.set(f.subjectId, []);
      m.get(f.subjectId)!.push(f);
    }
    return m;
  }, [org.folders]);

  const childrenByParent = useMemo(() => {
    const m = new Map<string, OrgFolder[]>();
    for (const f of org.folders) {
      if (f.parentId === null) continue;
      if (!m.has(f.parentId)) m.set(f.parentId, []);
      m.get(f.parentId)!.push(f);
    }
    return m;
  }, [org.folders]);

  // What the pane shows for the current selection: its subfolders, then its files.
  const currentSubfolders = useMemo(() => {
    if (isAll) return [];
    if (activeFolderId) return childrenByParent.get(activeFolderId) ?? [];
    if (activeSubjectId) return rootBySubject.get(activeSubjectId) ?? [];
    return [];
  }, [isAll, activeFolderId, activeSubjectId, childrenByParent, rootBySubject]);

  const visibleSources = useMemo(() => {
    if (isAll) return sources;
    if (activeFolderId) return sources.filter((s) => org.placements[s.id] === activeFolderId);
    if (activeSubjectId) return sources.filter((s) => s.subject_id === activeSubjectId && !org.placements[s.id]);
    return [];
  }, [isAll, activeFolderId, activeSubjectId, sources, org.placements]);

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Subject";

  function assignWeek(source: Source, weekId: string | null) {
    const prev = source.week_id ?? null;
    setSources((cur) => cur.map((s) => (s.id === source.id ? { ...s, week_id: weekId } : s)));
    api.assignSourceWeek(source.id, weekId).catch(() =>
      setSources((cur) => cur.map((s) => (s.id === source.id ? { ...s, week_id: prev } : s))),
    );
  }

  function remove(source: Source) {
    setSources((cur) => cur.filter((s) => s.id !== source.id));
    api.deleteSource(source.id).catch(() => setSources((cur) => [...cur, source]));
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function submitFolder(name: string) {
    if (!folderModal) return;
    if (folderModal.mode === "create") {
      const id = org.createFolder(folderModal.subjectId, folderModal.parentId, name);
      const expandKey = folderModal.parentId ?? folderModal.subjectId;
      if (expandKey) setExpanded((prev) => new Set(prev).add(expandKey));
      setFolder(`folder:${id}`);
    } else {
      org.renameFolder(folderModal.folder.id, name);
    }
    setFolderModal(null);
  }

  // Drop a dragged file into a folder (or subject root). A subject/its folders keep
  // their subject; a personal folder (targetSubjectId null) accepts any file.
  function dropSource(e: React.DragEvent, targetSubjectId: string | null, folderId: string | null) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    if (targetSubjectId !== null && src.subject_id !== targetSubjectId) return;
    org.placeSource(id, folderId);
  }

  function dragHandlers(key: string, subjectId: string | null, folderId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(key);
      },
      onDragLeave: () => setDragOver((k) => (k === key ? null : k)),
      onDrop: (e: React.DragEvent) => dropSource(e, subjectId, folderId),
    };
  }

  function renderFolder(f: OrgFolder, depth: number): ReactNode {
    const hasKids = (childrenByParent.get(f.id)?.length ?? 0) > 0;
    const open = expanded.has(f.id);
    const selected = activeFolderId === f.id;
    return (
      <div key={f.id}>
        <div
          className={`${styles.folderRow} ${selected ? styles.railActive : ""} ${dragOver === f.id ? styles.dropTarget : ""}`}
          style={{ paddingLeft: `calc(var(--space-2) + ${depth} * var(--space-4))` }}
          {...dragHandlers(f.id, f.subjectId, f.id)}
        >
          <button
            type="button"
            className={styles.caret}
            onClick={() => toggleExpand(f.id)}
            aria-label={open ? `Collapse ${f.name}` : `Expand ${f.name}`}
            aria-expanded={hasKids ? open : undefined}
            disabled={!hasKids}
          >
            {hasKids && <CaretRight weight="bold" className={`${styles.caretIcon} ${open ? styles.caretOpen : ""}`} />}
          </button>
          <button type="button" className={styles.folderBtn} onClick={() => setFolder(`folder:${f.id}`)}>
            {selected ? (
              <FolderOpen className={styles.railIcon} aria-hidden="true" weight="fill" />
            ) : (
              <Folder className={styles.railIcon} aria-hidden="true" />
            )}
            <span className={styles.railLabel}>{f.name}</span>
          </button>
          <FolderMenu
            name={f.name}
            onAddSub={() => setFolderModal({ mode: "create", subjectId: f.subjectId, parentId: f.id })}
            onRename={() => setFolderModal({ mode: "rename", folder: f })}
            onDelete={() => org.deleteFolder(f.id)}
          />
        </div>
        {open && (childrenByParent.get(f.id) ?? []).map((k) => renderFolder(k, depth + 1))}
      </div>
    );
  }

  const weekOptions = useMemo(
    () => [{ value: "", label: "Unassigned" }, ...weeks.map((w) => ({ value: w.id, label: `Week ${w.week_number}` }))],
    [weeks],
  );

  const personalRoots = rootBySubject.get(null) ?? [];
  const canAddFile = activeSubjectId != null || (activeFolderId != null && subjects.length > 0);
  const crossSubject = activeSubjectId == null; // "All files" or a personal folder → mixed subjects

  return (
    <div className={styles.screen}>
      <TopBar />
      <main className={styles.main}>
        <div className="page-wide">
          <div className="screen-header">
            <h1 className={styles.heading}>Drive</h1>
            <div className={styles.headerActions}>
              <Button variant="secondary" icon={<FolderPlus weight="bold" />} onClick={() => setFolderModal({ mode: "create", subjectId: null, parentId: null })}>
                New folder
              </Button>
              {activeSubjectId && (
                <Button
                  variant="secondary"
                  icon={<Sparkle weight="fill" />}
                  onClick={() => navigate(`/subject/${activeSubjectId}/study`)}
                >
                  Study dashboard
                </Button>
              )}
              {canAddFile && (
                <Button variant="primary" icon={<FilePlus weight="bold" />} onClick={() => setAdding(true)}>
                  Add file
                </Button>
              )}
            </div>
          </div>

          <div className={styles.board}>
            <nav className={`${styles.rail} glass`} aria-label="Folders">
              <button
                type="button"
                className={`${styles.railItem} ${isAll ? styles.railActive : ""}`}
                onClick={() => setFolder("all")}
              >
                <HardDrives className={styles.railIcon} aria-hidden="true" />
                <span className={styles.railLabel}>All files</span>
              </button>

              {subjects.map((s) => {
                const roots = rootBySubject.get(s.id) ?? [];
                const open = expanded.has(s.id);
                const selected = folder === s.id;
                return (
                  <div key={s.id}>
                    <div
                      className={`${styles.folderRow} ${selected ? styles.railActive : ""} ${dragOver === s.id ? styles.dropTarget : ""}`}
                      {...dragHandlers(s.id, s.id, null)}
                    >
                      <button
                        type="button"
                        className={styles.caret}
                        onClick={() => toggleExpand(s.id)}
                        aria-label={open ? `Collapse ${s.name}` : `Expand ${s.name}`}
                        aria-expanded={roots.length > 0 ? open : undefined}
                        disabled={roots.length === 0}
                      >
                        {roots.length > 0 && <CaretRight weight="bold" className={`${styles.caretIcon} ${open ? styles.caretOpen : ""}`} />}
                      </button>
                      <button type="button" className={styles.folderBtn} onClick={() => setFolder(s.id)}>
                        {selected ? (
                          <FolderOpen className={styles.railIcon} aria-hidden="true" weight="fill" />
                        ) : (
                          <Folder className={styles.railIcon} aria-hidden="true" />
                        )}
                        <span className={styles.railLabel}>{s.name}</span>
                      </button>
                      <span className={styles.folderActions}>
                        <IconButton label={`New folder in ${s.name}`} icon={<Plus />} size="sm" onClick={() => setFolderModal({ mode: "create", subjectId: s.id, parentId: null })} />
                      </span>
                    </div>
                    {open && roots.map((f) => renderFolder(f, 1))}
                  </div>
                );
              })}

              {personalRoots.map((f) => renderFolder(f, 0))}
            </nav>

            <section className={`${styles.filesPane} glass`} aria-label="Files">
              {currentSubfolders.length === 0 && visibleSources.length === 0 ? (
                <EmptyState
                  icon={<Folder weight="fill" />}
                  title={isAll ? "No files yet" : activeFolderId ? "This folder is empty" : "This subject has no files"}
                  description={
                    activeFolderId
                      ? "Drag files here from another view, or add a file, to organize them into this folder."
                      : "Add a PDF, slide deck, document, or recording. Arbora indexes it so every generated note and card can cite it."
                  }
                  action={
                    canAddFile && (
                      <Button variant="primary" icon={<FilePlus weight="bold" />} onClick={() => setAdding(true)}>
                        Add file
                      </Button>
                    )
                  }
                />
              ) : (
                <ul className={styles.fileList}>
                  {currentSubfolders.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={`${styles.dirRow} ${dragOver === `pane:${f.id}` ? styles.dropTarget : ""}`}
                        onClick={() => setFolder(`folder:${f.id}`)}
                        {...dragHandlers(`pane:${f.id}`, f.subjectId, f.id)}
                      >
                        <Folder className={styles.railIcon} aria-hidden="true" weight="fill" />
                        <span className={styles.dirName}>{f.name}</span>
                        <CaretRight className={styles.dirChevron} weight="bold" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                  {visibleSources.map((s) => {
                    const ready = s.ingest_state === "processed";
                    return (
                      <li
                        key={s.id}
                        className={styles.file}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", s.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        <button
                          type="button"
                          className={styles.fileMain}
                          disabled={!ready}
                          onClick={() => viewer?.openSourceById({ sourceId: s.id, sourceTitle: s.title })}
                          title={ready ? `Open ${s.title}` : "Still processing"}
                        >
                          <span className={styles.fileTitle}>{s.title}</span>
                          <span className={styles.fileMeta}>
                            {crossSubject && `${subjectName(s.subject_id)} · `}
                            {s.type.toUpperCase()}
                            {" · "}
                            <span className={s.ingest_state === "error" ? styles.metaError : ""}>
                              {STATE_LABEL[s.ingest_state]}
                            </span>
                          </span>
                        </button>
                        {activeSubjectId && (
                          <div className={styles.fileSelect}>
                            <Select
                              aria-label="Week"
                              value={s.week_id ?? ""}
                              options={weekOptions}
                              placeholder="Unassigned"
                              onChange={(v) => assignWeek(s, v || null)}
                            />
                          </div>
                        )}
                        {ready && (
                          <IconButton
                            label={`Open ${s.title}`}
                            icon={<ArrowSquareOut />}
                            size="sm"
                            onClick={() => viewer?.openSourceById({ sourceId: s.id, sourceTitle: s.title })}
                          />
                        )}
                        <IconButton label={`Delete ${s.title}`} icon={<Trash />} size="sm" onClick={() => remove(s)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>

      <AddSourceModal
        open={adding}
        onClose={() => setAdding(false)}
        subjectId={activeSubjectId ?? undefined}
        subjects={subjects}
        onAdded={(s) => {
          setSources((prev) => [...prev, s]);
          if (activeFolderId) org.placeSource(s.id, activeFolderId);
        }}
      />

      <FolderModal
        state={folderModal}
        onClose={() => setFolderModal(null)}
        onSubmit={submitFolder}
      />
    </div>
  );
}

/** The per-folder ⋮ menu: new subfolder, rename, delete. */
function FolderMenu({
  name,
  onAddSub,
  onRename,
  onDelete,
}: {
  name: string;
  onAddSub: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { open, setOpen, coords, triggerRef, popoverRef } = usePopover<HTMLDivElement>(150, 180);
  // Move focus into the menu on open so it's keyboard-navigable (Tab across items).
  useEffect(() => {
    if (open) popoverRef.current?.focus();
  }, [open, popoverRef]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <span className={styles.folderActions}>
      <IconButton
        ref={triggerRef}
        label={`Actions for ${name}`}
        icon={<DotsThreeVertical weight="bold" />}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            tabIndex={-1}
            className={styles.menu}
            style={{
              top: coords.up ? undefined : coords.top,
              bottom: coords.up ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: coords.width,
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            <button type="button" role="menuitem" className={styles.menuItem} onClick={run(onAddSub)}>
              <Plus aria-hidden="true" /> New subfolder
            </button>
            <button type="button" role="menuitem" className={styles.menuItem} onClick={run(onRename)}>
              <PencilSimple aria-hidden="true" /> Rename
            </button>
            <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={run(onDelete)}>
              <Trash aria-hidden="true" /> Delete
            </button>
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Create-folder / rename-folder dialog (a subfolder when a parent is set). */
function FolderModal({
  state,
  onClose,
  onSubmit,
}: {
  state: { mode: "create"; subjectId: string | null; parentId: string | null } | { mode: "rename"; folder: OrgFolder } | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    setName(state?.mode === "rename" ? state.folder.name : "");
  }, [state]);
  const trimmed = name.trim();
  const isRename = state?.mode === "rename";
  const title = isRename ? "Rename folder" : state?.parentId ? "New subfolder" : "New folder";

  return (
    <Modal
      open={state !== null}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => trimmed && onSubmit(trimmed)} disabled={!trimmed}>
            {isRename ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <Input label="Folder name" placeholder="e.g. Readings" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </form>
    </Modal>
  );
}
