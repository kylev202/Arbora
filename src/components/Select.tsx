import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react";
import { usePopover } from "./usePopover";
import styles from "./Select.module.css";

export type SelectOption<T extends string> = { value: T; label: string };

export type SelectProps<T extends string> = {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Shown when the current value has no matching option (e.g. empty). */
  placeholder?: string;
  id?: string;
  disabled?: boolean;
};

const ROW = 40; // approx option height, for the flip-height estimate

/**
 * Custom listbox dropdown — a glass-styled replacement for native <select>, whose
 * option popup the OS renders and CSS can't reach. Portaled to <body> so it escapes
 * the modal's scroll clip; positioned under (or above) the trigger. Keyboard: Up/Down/
 * Home/End move, Enter/Space select, Esc close, plus type-ahead. Values are strings.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  id,
  disabled,
}: SelectProps<T>) {
  const autoId = useId();
  const rootId = id ?? autoId;
  const listId = `${rootId}-list`;

  const { open, setOpen, coords, triggerRef, popoverRef } = usePopover<HTMLUListElement>(
    Math.min(280, options.length * ROW + 12),
  );
  const listRef = popoverRef;
  const typeahead = useRef({ query: "", at: 0 });
  const [active, setActive] = useState(0);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Open: seed the active option and lock focus on the list.
  useLayoutEffect(() => {
    if (!open) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    const id = requestAnimationFrame(() => listRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, selectedIndex, listRef]);

  function commit(index: number) {
    const opt = options[index];
    if (opt) onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation(); // don't let the modal close too
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        // Close and hand focus back to the trigger so the modal's focus trap,
        // which only tracks elements inside the dialog, keeps working.
        setOpen(false);
        triggerRef.current?.focus();
        break;
      default:
        if (e.key.length === 1) {
          const now = Date.now();
          const q = now - typeahead.current.at > 600 ? e.key : typeahead.current.query + e.key;
          typeahead.current = { query: q, at: now };
          const match = options.findIndex((o) => o.label.toLowerCase().startsWith(q.toLowerCase()));
          if (match >= 0) setActive(match);
        }
    }
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [open, active]);

  return (
    <div className={styles.field}>
      {label && (
        <span className={styles.label} id={`${rootId}-label`}>
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={rootId}
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={label ? `${rootId}-label ${rootId}` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={selected ? styles.value : styles.placeholder}>
          {selected ? selected.label : placeholder}
        </span>
        <CaretDown weight="bold" className={`${styles.caret} ${open ? styles.caretOpen : ""}`} />
      </button>

      {open &&
        coords &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={label ? `${rootId}-label` : undefined}
            aria-activedescendant={`${listId}-opt-${active}`}
            className={`${styles.popover} ${coords.up ? styles.up : styles.down}`}
            style={{
              top: coords.up ? undefined : coords.top,
              bottom: coords.up ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
            }}
            onKeyDown={onListKeyDown}
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value;
              return (
                <li
                  key={opt.value}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  data-index={i}
                  aria-selected={isSelected}
                  className={`${styles.option} ${i === active ? styles.active : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(i)}
                >
                  <span className={styles.optionLabel}>{opt.label}</span>
                  {isSelected && <Check weight="bold" className={styles.checkIcon} />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
