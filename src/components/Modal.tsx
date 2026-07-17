import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { IconButton } from "./IconButton";
import styles from "./Modal.module.css";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional right-aligned text in the header (e.g. "2 / 3"). */
  meta?: ReactNode;
  size?: "sm" | "md";
  children: ReactNode;
  /** Footer actions row (right-aligned). */
  footer?: ReactNode;
  /** Hide the close (✕) button — e.g. blocking onboarding steps. */
  hideClose?: boolean;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible centered modal: focus trap, Esc-to-close, focus restored to the
 * trigger on close, aria-modal. Motion is fade + small translateY (reduced-motion
 * neutralises it via tokens). Rendered in a portal so it escapes layout context.
 */
export function Modal({
  open,
  onClose,
  title,
  meta,
  size = "md",
  children,
  footer,
  hideClose,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // Unique per instance so stacked modals (e.g. viewer + edit) don't share ids.
  const titleId = useId();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable || focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // Save trigger, move focus in on open; restore on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable && focusable.length > 0 ? focusable[0] : dialogRef.current)?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={`${styles.dialog} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <div className={styles.headerRight}>
            {meta && <span className={styles.meta}>{meta}</span>}
            {!hideClose && (
              <IconButton label="Close" icon={<X />} size="sm" onClick={onClose} />
            )}
          </div>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
