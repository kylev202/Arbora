import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Geometry of the sliding thumb, in px relative to the nav's padding box. */
export type Thumb = { left: number; width: number };

/**
 * Drives the single "thumb" pill that springs under the active segment of a
 * segmented nav (TopBar and SubjectNav share this). Tap/keyboard only — a nav
 * is not a slider, so there is deliberately no drag interaction; NavLink owns
 * navigation and this just animates the indicator.
 *
 * Returns the nav ref, a per-segment ref setter, the thumb geometry, and
 * `animate` (false for the first paint so the thumb doesn't fly in from the
 * corner). Pass `enabled=false` while the nav is unmounted so re-mounting it
 * re-measures.
 */
export function useSlideThumb(activeIndex: number, enabled = true) {
  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<(HTMLElement | null)[]>([]);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  const [animate, setAnimate] = useState(false);

  const setLinkRef = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      linkRefs.current[i] = el;
    },
    [],
  );

  /** Read the active segment's geometry from the DOM. */
  const measure = useCallback(() => {
    const el = linkRefs.current[activeIndex];
    if (!el || activeIndex < 0) return;
    setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeIndex]);

  // Position under the active segment, and keep it there when the nav mounts or
  // resizes (font/icon load, viewport changes).
  useLayoutEffect(() => {
    if (enabled) measure();
  }, [measure, enabled]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !enabled) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measure, enabled]);

  // Arm the spring only after the first paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return { navRef, setLinkRef, thumb, animate };
}
