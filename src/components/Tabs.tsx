import { useRef, type ReactNode } from "react";
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
 * The active tab gets an underline indicator. Panels are rendered by the caller
 * (each should have role=tabpanel + aria-labelledby={`tab-${id}`}).
 */
export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

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
    refs.current[nextId]?.focus();
  }

  return (
    <div className={styles.tablist} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
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
