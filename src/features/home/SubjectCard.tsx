import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { CalendarBlank, Cards, DotsThreeVertical, PencilSimple, Trash } from "@phosphor-icons/react";
import { IconButton, Tree } from "../../components";
import { usePopover } from "../../components/usePopover";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { relativeDays } from "../../lib/date";
import type { Subject } from "../../lib/types";
import styles from "./SubjectCard.module.css";

/**
 * A subject tile (S-01): accent stripe, name, a mini tree mirroring real
 * mastery, today's due count, and the next deadline (neutral countdown). The
 * whole card is one link → the subject workspace, with a ⋮ menu (sibling,
 * not nested inside the link) for quick edit/delete.
 */
export function SubjectCard({
  subject,
  onEdit,
  onDelete,
}: {
  subject: Subject;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dash = useAsync(() => api.getSubjectDashboard(subject.id), [subject.id]);

  return (
    <div className={styles.cardWrap} style={{ ["--subject-color" as string]: subject.color }}>
      <Link to={`/subject/${subject.id}/overview`} className={styles.card}>
        <div className={styles.head}>
          <span className={styles.dot} aria-hidden="true" />
          <h3 className={styles.name}>{subject.name}</h3>
        </div>

        <div className={styles.tree}>
          {dash.status === "loaded" ? (
            <Tree data={dash.data.tree} seed={subject.id} size={140} hideCaption />
          ) : (
            <div className={styles.treeSkeleton} aria-hidden="true" />
          )}
        </div>

        <div className={styles.meta}>
          <span className={styles.metaRow}>
            <Cards className={styles.metaIcon} aria-hidden="true" />
            {dash.status === "loaded"
              ? `${dash.data.stats.due_today} cards today`
              : "—"}
          </span>
          <span className={styles.metaRow}>
            <CalendarBlank className={styles.metaIcon} aria-hidden="true" />
            {dash.status === "loaded" && dash.data.next_deadline
              ? `${dash.data.next_deadline.title} · ${relativeDays(dash.data.next_deadline.due_at)}`
              : "No deadlines"}
          </span>
        </div>
      </Link>

      <SubjectCardMenu name={subject.name} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

/** The card's ⋮ menu: edit (rename/recolour) or delete. Rendered as a sibling
 * of the card's Link (never nested inside it) so it stays valid, clickable HTML. */
function SubjectCardMenu({
  name,
  onEdit,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { open, setOpen, coords, triggerRef, popoverRef } = usePopover<HTMLDivElement>(96, 160);

  useEffect(() => {
    if (open) popoverRef.current?.focus();
  }, [open, popoverRef]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <span className={styles.menuTrigger}>
      <IconButton
        ref={triggerRef}
        label={`Actions for ${name}`}
        icon={<DotsThreeVertical weight="bold" />}
        size="sm"
        variant="surface"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            tabIndex={-1}
            className={styles.menu}
            style={{
              top: coords.up ? undefined : coords.top,
              bottom: coords.up ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: coords.width,
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            <button type="button" role="menuitem" className={styles.menuItem} onClick={run(onEdit)}>
              <PencilSimple aria-hidden="true" /> Edit subject
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuDanger}`}
              onClick={run(onDelete)}
            >
              <Trash aria-hidden="true" /> Delete
            </button>
          </div>,
          document.body,
        )}
    </span>
  );
}
