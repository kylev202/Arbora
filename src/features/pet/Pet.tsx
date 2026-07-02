import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plant, X } from "@phosphor-icons/react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onOllamaStatus } from "../../lib/ipc";
import { api } from "../../lib/api";
import { useSettings } from "../../app/settings";
import { PetPanel } from "./PetPanel";
import styles from "./Pet.module.css";

const POS_KEY = "arbora.pet.pos";
const BUBBLE_SHOWN_KEY = "arbora.pet.lastBubble";
/** At most one suggestion bubble per 4 hours — restrained, never nagging. */
const BUBBLE_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const BUBBLE_TTL_MS = 12_000;
const AVATAR_SIZE = 52;
const DRAG_THRESHOLD = 5;

export type PetState = "idle" | "thinking" | "speaking" | "celebrate";

/** Fired by screens when the user completes something worth a gentle cheer. */
export const CELEBRATE_EVENT = "arbora:celebrate";

type Bubble = { text: string; go: () => void };

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
  const navigate = useNavigate();
  const settings = useSettings();
  const [pos, setPos] = useState<Pos>(loadPos);
  const [open, setOpen] = useState(false);
  const [petState, setPetState] = useState<PetState>("idle");
  const [ollamaReady, setOllamaReady] = useState(false);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: Pos; moved: boolean } | null>(
    null,
  );

  // Gentle celebrate on completion events (SessionRecap etc.) — brief, calm.
  useEffect(() => {
    let timer: number | undefined;
    function onCelebrate() {
      setPetState("celebrate");
      timer = window.setTimeout(() => setPetState("idle"), 2500);
    }
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // One restrained proactive suggestion (§1.2): at most one bubble per
  // cooldown window, auto-dissolves, plain local data (no AI call), and the
  // whole behaviour can be turned off in Settings.
  useEffect(() => {
    if (!settings.petSuggestions || open) return;
    const last = Number(localStorage.getItem(BUBBLE_SHOWN_KEY) ?? 0);
    if (Date.now() - last < BUBBLE_COOLDOWN_MS) return;

    let cancelled = false;
    let ttl: number | undefined;
    (async () => {
      try {
        const due = await api.getDueCardsInterleaved();
        let next: Bubble | null = null;
        if (due.length > 0) {
          next = {
            text: `${due.length} card${due.length === 1 ? " is" : "s are"} ready when you are 🌱`,
            go: () => navigate("/interleaved?smart=1"),
          };
        } else {
          const now = new Date();
          const nowIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const events = await api.listEvents(undefined, nowIso);
          const missed = events.filter((e) => e.kind === "study" && e.status === "planned");
          if (missed.length > 0) {
            next = {
              text: "A study session slipped by — want help finding a new spot?",
              go: () => navigate("/calendar"),
            };
          }
        }
        if (next && !cancelled) {
          setBubble(next);
          localStorage.setItem(BUBBLE_SHOWN_KEY, String(Date.now()));
          ttl = window.setTimeout(() => setBubble(null), BUBBLE_TTL_MS);
        }
      } catch {
        /* suggestions are best-effort */
      }
    })();
    return () => {
      cancelled = true;
      if (ttl) window.clearTimeout(ttl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.petSuggestions]);

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
      {bubble && !open && (
        <div
          className={styles.bubble}
          style={{
            left: pos.left > window.innerWidth / 2 ? undefined : pos.left,
            right: pos.left > window.innerWidth / 2 ? window.innerWidth - pos.left - AVATAR_SIZE : undefined,
            top: pos.top - 56,
          }}
          role="status"
        >
          <button type="button" className={styles.bubbleBody} onClick={() => { setBubble(null); bubble.go(); }}>
            {bubble.text}
          </button>
          <button
            type="button"
            className={styles.bubbleClose}
            aria-label="Dismiss suggestion"
            onClick={() => setBubble(null)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
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
