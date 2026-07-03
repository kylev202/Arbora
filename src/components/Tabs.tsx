import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  /** Small count badge, e.g. "3 due". Neutral styling, never red. */
  badge?: ReactNode;
};

export type TabsProps<T extends string> = {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name for the tablist. */
  label: string;
};

/**
 * In-page tab strip (role=tablist) with roving tabindex + arrow-key navigation.
 * A sliding underline indicator springs to the active tab. Panels are rendered
 * by the caller (each should have role=tabpanel + aria-labelledby={`tab-${id}`}).
 */
export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  const measure = useCallback(() => {
    const el = buttonRefs.current[value];
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    const idx = items.findIndex((t) => t.id === value);
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    const nextId = items[next].id;
    onChange(nextId);
    buttonRefs.current[nextId]?.focus();
  }

  return (
    <div
      ref={listRef}
      className={styles.tablist}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {indicator && (
        <span
          aria-hidden="true"
          className={`${styles.indicator} ${animate ? "" : styles.noTransition}`}
          style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
        />
      )}
      {items.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[tab.id] = el;
            }}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tab} ${selected ? styles.selected : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.badge != null && <span className={styles.badge}>{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
