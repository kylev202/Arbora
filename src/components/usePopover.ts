import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type PopoverCoords = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  up: boolean;
};

const GAP = 6; // px between trigger and popover
const MARGIN = 8; // keep clear of the viewport edge

/**
 * Shared open/position/dismiss logic for glass popovers (Select, DatePicker, …).
 * Anchors a portaled popover to a trigger button: flips above when there's no room
 * below, clamps into the viewport, re-pins on scroll/resize, and closes on any
 * outside pointer-down. Focus handling stays with the consumer — it's control-specific.
 *
 * `width` fixes the popover width (and enables horizontal clamping); omit it to
 * match the trigger's width.
 */
export function usePopover<E extends HTMLElement>(desiredHeight: number, width?: number) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<E | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = width ?? r.width;
    const below = window.innerHeight - r.bottom - GAP;
    const above = r.top - GAP;
    const up = below < Math.min(desiredHeight, above);
    const left = Math.min(Math.max(MARGIN, r.left), window.innerWidth - w - MARGIN);
    setCoords({
      top: up ? r.top - GAP : r.bottom + GAP,
      left,
      width: w,
      maxHeight: Math.max(140, Math.min(desiredHeight, up ? above : below)),
      up,
    });
  }, [desiredHeight, width]);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const handler = () => position();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return { open, setOpen, coords, triggerRef, popoverRef };
}
