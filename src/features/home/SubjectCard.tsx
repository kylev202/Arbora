import { Link } from "react-router-dom";
import { CalendarBlank, Cards } from "@phosphor-icons/react";
import { Tree } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { relativeDays } from "../../lib/date";
import type { Subject } from "../../lib/types";
import styles from "./SubjectCard.module.css";

/**
 * A subject tile (S-01): accent stripe, name, a mini tree mirroring real
 * mastery, today's due count, and the next deadline (neutral countdown). The
 * whole card is one link → the subject workspace.
 */
export function SubjectCard({ subject }: { subject: Subject }) {
  const dash = useAsync(() => api.getSubjectDashboard(subject.id), [subject.id]);

  return (
    <Link
      to={`/subject/${subject.id}/timeline`}
      className={styles.card}
      style={{ ["--subject-color" as string]: subject.color }}
    >
      <span className={styles.stripe} aria-hidden="true" />
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
  );
}
