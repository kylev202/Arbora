import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { openQuickNote } from "./quickNote";

/** True when the event target is a field, so we don't hijack the user's typing. */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Destinations reachable with a `g` chord (Gmail / Linear style). */
const GO_TO: Record<string, string> = {
  h: "/",
  c: "/calendar",
  t: "/todos",
  d: "/drive",
  s: "/settings",
};

/**
 * App-wide keyboard accelerators, mounted once at the root:
 *   g then h/c/t/d/s → Home · Calendar · Tasks · Drive · Settings
 *   /                → open the quick-note island
 * Ignored while typing in a field or when a modifier is held, so browser and
 * text shortcuts keep working. In-session study keys (Space, 1-4) live in
 * StudyScreen, which is the focused surface when they apply.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const goPending = useRef(false);
  const goTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearGo() {
      goPending.current = false;
      if (goTimer.current) {
        window.clearTimeout(goTimer.current);
        goTimer.current = null;
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (goPending.current) {
        const dest = GO_TO[e.key.toLowerCase()];
        clearGo();
        if (dest) {
          e.preventDefault();
          navigate(dest);
        }
        return;
      }

      if (e.key === "g") {
        goPending.current = true;
        goTimer.current = window.setTimeout(clearGo, 1200);
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        openQuickNote();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearGo();
    };
  }, [navigate]);
}
