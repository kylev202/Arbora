import { useEffect, useRef, useState } from "react";
import { Plant } from "@phosphor-icons/react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onOllamaStatus } from "../../lib/ipc";
import { api } from "../../lib/api";
import { PetPanel } from "./PetPanel";
import styles from "./Pet.module.css";

const POS_KEY = "arbora.pet.pos";
const AVATAR_SIZE = 52;
const DRAG_THRESHOLD = 5;

export type PetState = "idle" | "thinking" | "speaking";

type Pos = { left: number; top: number };

function defaultPos(): Pos {
  return {
    left: window.innerWidth - AVATAR_SIZE - 24,
    top: window.innerHeight - AVATAR_SIZE - 24,
  };
}

function clamp(pos: Pos): Pos {
  return {
    left: Math.min(Math.max(pos.left, 8), window.innerWidth - AVATAR_SIZE - 8),
    top: Math.min(Math.max(pos.top, 8), window.innerHeight - AVATAR_SIZE - 8),
  };
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return clamp(JSON.parse(raw) as Pos);
  } catch {
    /* corrupt value → default */
  }
  return defaultPos();
}

/**
 * The floating pet companion (redesign §1.2): a small tree-sprite anchored to a
 * screen corner. Draggable (position remembered), keyboard operable (click or
 * Ctrl+. opens the chat, Esc closes), never opens itself over content. Calm:
 * the idle "breathing" stops under reduced motion without losing any function.
 */
export function Pet() {
  const [pos, setPos] = useState<Pos>(loadPos);
  const [open, setOpen] = useState(false);
  const [petState, setPetState] = useState<PetState>("idle");
  const [ollamaReady, setOllamaReady] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: Pos; moved: boolean } | null>(
    null,
  );

  // Track the silently-supervised Ollama daemon so the panel can show a calm
  // "getting ready…" hint instead of a hard error.
  useEffect(() => {
    let unsub: UnlistenFn | undefined;
    api.ollamaStatus().then((s) => setOllamaReady(s.ready)).catch(() => {});
    onOllamaStatus((e) => setOllamaReady(e.state === "ready")).then((u) => {
      unsub = u;
    });
    return () => unsub?.();
  }, []);

  // Keyboard shortcut: Ctrl+. toggles the chat.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === ".") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the avatar on-screen when the window shrinks.
  useEffect(() => {
    function onResize() {
      setPos((p) => clamp(p));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    setPos(clamp({ left: drag.origin.left + dx, top: drag.origin.top + dy }));
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) {
      setPos((p) => {
        localStorage.setItem(POS_KEY, JSON.stringify(p));
        return p;
      });
    } else {
      setOpen((o) => !o);
    }
  }

  function close() {
    setOpen(false);
    avatarRef.current?.focus();
  }

  return (
    <>
      {open && (
        <PetPanel
          anchor={pos}
          ollamaReady={ollamaReady}
          onClose={close}
          onStateChange={setPetState}
        />
      )}
      <button
        ref={avatarRef}
        type="button"
        className={`${styles.avatar} ${styles[petState]}`}
        style={{ left: pos.left, top: pos.top }}
        aria-label={open ? "Close Arbora pet chat" : "Open Arbora pet chat (Ctrl+.)"}
        aria-expanded={open}
        title="Chat with your study companion (Ctrl+.)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <Plant weight="fill" aria-hidden="true" />
      </button>
    </>
  );
}
