import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowSquareOut, X } from "@phosphor-icons/react";
import { Button, IconButton } from "../../components";
import { api } from "../../lib/api";
import { NoteEditor } from "./NoteEditor";
import styles from "./QuickNoteModal.module.css";

const isEmpty = (html: string) => html.replace(/<[^>]+>/g, "").trim().length === 0;

/**
 * Quick capture as a floating island in the top-right corner — deliberately NOT
 * a modal: no backdrop, no blur, nothing blocked, so you can read and copy from
 * the screen behind it while you jot. Saves into the "Quick notes" folder; "Open
 * full notes" saves first (nothing is lost) then jumps to the workspace.
 */
export function QuickNoteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [content, setContent] = useState("");

  // Reset the draft each time it opens.
  useEffect(() => {
    if (open) setContent("");
  }, [open]);

  // Esc closes; keep it non-modal otherwise (clicking the app behind is fine).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function save() {
    if (!isEmpty(content)) await api.createQuickNote(content);
    setContent("");
    onClose();
  }

  async function openFull() {
    await save();
    navigate("/notes");
  }

  return createPortal(
    <aside className={`${styles.island} glass-strong`} role="dialog" aria-label="Quick note">
      <header className={styles.head}>
        <h2 className={styles.title}>Quick note</h2>
        <div className={styles.headActions}>
          <IconButton label="Open full notes" icon={<ArrowSquareOut />} size="sm" onClick={() => void openFull()} />
          <IconButton label="Close" icon={<X />} size="sm" onClick={() => void save()} />
        </div>
      </header>
      <div className={styles.body}>
        <NoteEditor content="" onChange={setContent} placeholder="Jot something down…" compact />
      </div>
      <footer className={styles.foot}>
        <Button variant="primary" size="sm" onClick={() => void save()}>
          Save &amp; close
        </Button>
      </footer>
    </aside>,
    document.body,
  );
}
