/**
 * Global "open the quick-note island" signal. The QuickNoteModal is mounted once
 * at the app root; any surface (the top-bar button, the `/` shortcut) opens it by
 * firing this event, so there's a single instance instead of one per top bar.
 */
const QUICK_NOTE_EVENT = "arbora:open-quick-note";

export function openQuickNote() {
  window.dispatchEvent(new Event(QUICK_NOTE_EVENT));
}

/** Subscribe to open requests; returns an unsubscribe fn. */
export function onOpenQuickNote(handler: () => void): () => void {
  window.addEventListener(QUICK_NOTE_EVENT, handler);
  return () => window.removeEventListener(QUICK_NOTE_EVENT, handler);
}
