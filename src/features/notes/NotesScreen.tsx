import { useEffect, useMemo, useRef, useState } from "react";
import {
  CornersIn,
  CornersOut,
  FilePlus,
  Folder,
  FolderPlus,
  Lightning,
  NotePencil,
  SidebarSimple,
  Trash,
} from "@phosphor-icons/react";
import { Button, EmptyState, IconButton, Input, Modal, Select } from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { api } from "../../lib/api";
import type { NoteFolder, UserNote } from "../../lib/types";
import { NoteEditor } from "./NoteEditor";
import styles from "./NotesScreen.module.css";

/** Strip HTML to a short preview for the note list. */
function preview(html: string): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/**
 * Notes: a OneNote-style workspace — a folder rail, a note list, and the rich
 * editor. Subject folders are auto-created; the user adds their own folders and
 * moves notes between them. These are the user's own notes (no review gate),
 * separate from AI-generated cited notes.
 */
export function NotesScreen() {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Esc leaves fullscreen (a calm, expected exit).
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Load folders; default into the first one.
  useEffect(() => {
    api.listNoteFolders().then((f) => {
      setFolders(f);
      setFolderId((cur) => cur ?? f[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  // Load the selected folder's notes.
  useEffect(() => {
    if (!folderId) return;
    let cancelled = false;
    api.listUserNotes(folderId).then((n) => {
      if (cancelled) return;
      setNotes(n);
      setSelectedId(n[0]?.id ?? null);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const folderName = (id: string) => folders.find((f) => f.id === id)?.name ?? "Folder";

  // Debounced autosave: merge in place (no re-sort) so the caret stays put.
  function scheduleSave(id: string, title: string, content: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.updateNote(id, title, content)
        .then((saved) => setNotes((prev) => prev.map((n) => (n.id === id ? saved : n))))
        .catch(() => {});
    }, 600);
  }

  function editTitle(title: string) {
    if (!selected) return;
    setNotes((prev) => prev.map((n) => (n.id === selected.id ? { ...n, title } : n)));
    scheduleSave(selected.id, title, selected.content);
  }
  function editContent(content: string) {
    if (!selected) return;
    setNotes((prev) => prev.map((n) => (n.id === selected.id ? { ...n, content } : n)));
    scheduleSave(selected.id, selected.title, content);
  }

  async function newNote() {
    if (!folderId) return;
    const created = await api.createNote(folderId, "Untitled");
    setNotes((prev) => [created, ...prev]);
    setSelectedId(created.id);
  }

  async function removeNote(id: string) {
    await api.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function moveNote(id: string, targetFolder: string) {
    await api.moveNote(id, targetFolder);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setSelectedId(null);
  }

  async function createFolder(name: string) {
    const created = await api.createNoteFolder(name);
    setFolders((prev) => [...prev, created]);
    setCreatingFolder(false);
    setFolderId(created.id);
  }

  async function deleteFolder(id: string) {
    await api.deleteNoteFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (folderId === id) setFolderId(folders[0]?.id ?? null);
  }

  const folderOptions = useMemo(
    () => folders.map((f) => ({ value: f.id, label: f.name })),
    [folders],
  );

  const iconFor = (f: NoteFolder) => (f.kind === "quick" ? Lightning : Folder);

  return (
    <div className={styles.screen}>
      <TopBar />
      <main className={styles.main}>
        <div className="page-wide">
          <div className="screen-header">
            <h1 className={styles.heading}>Notes</h1>
            <Button variant="secondary" icon={<FolderPlus weight="bold" />} onClick={() => setCreatingFolder(true)}>
              New folder
            </Button>
          </div>

          <div className={`${styles.board} ${fullscreen ? styles.boardFull : ""}`}>
            {/* ── Collapsible side panels (folders + note list) ── */}
            <div
              className={`${styles.sidebar} ${panelsOpen ? "" : styles.sidebarClosed}`}
              aria-hidden={!panelsOpen}
            >
            {/* ── Folders ── */}
            <nav className={`${styles.rail} glass`} aria-label="Folders">
              {folders.map((f) => {
                const Icon = iconFor(f);
                return (
                  <div key={f.id} className={`${styles.railItem} ${folderId === f.id ? styles.railActive : ""}`}>
                    <button type="button" className={styles.railBtn} onClick={() => setFolderId(f.id)}>
                      <Icon className={styles.railIcon} aria-hidden="true" weight={f.kind === "quick" ? "fill" : "regular"} />
                      <span className={styles.railLabel}>{f.name}</span>
                    </button>
                    {f.kind === "user" && (
                      <IconButton label={`Delete ${f.name}`} icon={<Trash />} size="sm" onClick={() => void deleteFolder(f.id)} />
                    )}
                  </div>
                );
              })}
            </nav>

            {/* ── Note list ── */}
            <section className={`${styles.listPane} glass`} aria-label="Notes">
              <div className={styles.listHead}>
                <h2 className={styles.listTitle}>{folderId ? folderName(folderId) : "Notes"}</h2>
                <Button size="sm" variant="secondary" icon={<FilePlus weight="bold" />} onClick={() => void newNote()} disabled={!folderId}>
                  New note
                </Button>
              </div>
              {notes.length === 0 ? (
                <EmptyState icon={<NotePencil weight="fill" />} title="No notes yet" description="Create a note to start writing." />
              ) : (
                <ul className={styles.noteList}>
                  {notes.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`${styles.noteItem} ${n.id === selectedId ? styles.noteActive : ""}`}
                        onClick={() => setSelectedId(n.id)}
                      >
                        <span className={styles.noteTitle}>{n.title}</span>
                        <span className={styles.notePreview}>{preview(n.content) || "Empty note"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            </div>

            {/* ── Editor island ── */}
            <section className={`${styles.editorPane} glass-strong ${fullscreen ? styles.editorFull : ""}`} aria-label="Editor">
              <div className={styles.editorHead}>
                <IconButton
                  label={panelsOpen ? "Hide panels" : "Show panels"}
                  icon={<SidebarSimple weight={panelsOpen ? "fill" : "regular"} />}
                  onClick={() => setPanelsOpen((v) => !v)}
                />
                {selected ? (
                  <>
                    <input
                      className={styles.titleInput}
                      aria-label="Note title"
                      value={selected.title}
                      onChange={(e) => editTitle(e.target.value)}
                    />
                    <div className={styles.editorActions}>
                      <Select
                        label="Move to"
                        value={selected.folder_id}
                        options={folderOptions}
                        onChange={(v) => v !== selected.folder_id && void moveNote(selected.id, v)}
                      />
                      <IconButton
                        label={fullscreen ? "Exit full screen" : "Full screen"}
                        icon={fullscreen ? <CornersIn /> : <CornersOut />}
                        onClick={() => setFullscreen((v) => !v)}
                      />
                      <IconButton label="Delete note" icon={<Trash />} onClick={() => void removeNote(selected.id)} />
                    </div>
                  </>
                ) : (
                  <span className={styles.editorPlaceholderTitle}>Notes</span>
                )}
              </div>
              {selected ? (
                <NoteEditor key={selected.id} content={selected.content} onChange={editContent} />
              ) : (
                <EmptyState
                  icon={<NotePencil weight="fill" />}
                  title="Nothing selected"
                  description="Pick a note on the left, or create a new one."
                />
              )}
            </section>
            {fullscreen && <div className={styles.backdrop} onClick={() => setFullscreen(false)} />}
          </div>
        </div>
      </main>

      <CreateFolderModal open={creatingFolder} onClose={() => setCreatingFolder(false)} onCreate={createFolder} />
    </div>
  );
}

function CreateFolderModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New folder"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (trimmed) onCreate(trimmed);
              setName("");
            }}
            disabled={!trimmed}
          >
            Create
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) {
            onCreate(trimmed);
            setName("");
          }
        }}
      >
        <Input label="Folder name" placeholder="e.g. Lecture notes" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </form>
    </Modal>
  );
}
