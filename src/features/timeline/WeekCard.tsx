import {
  Exam,
  FilePdf,
  FileText,
  Headphones,
  type Icon,
  NotePencil,
  Presentation,
  Target,
} from "@phosphor-icons/react";
import { IconButton, Tag } from "../../components";
import { formatDate, relativeDays } from "../../lib/date";
import type { Deadline, PriorityItem, Source, SourceType, Week } from "../../lib/types";
import styles from "./WeekCard.module.css";

const TYPE_ICON: Record<SourceType, Icon> = {
  pdf: FilePdf,
  slide: Presentation,
  audio: Headphones,
};

/** Calm word for a material still working through ingest (processed shows nothing). */
function matState(s: Source): string {
  switch (s.ingest_state) {
    case "queued":
      return "queued";
    case "processing":
      return "processing…";
    case "error":
      return "needs attention";
    default:
      return "";
  }
}

/**
 * One week on the Timeline spine: its topic + summary, the deadlines that land in
 * it, and the materials hung off it. Presentational — editing flows up via onEdit.
 */
export function WeekCard({
  week,
  materials,
  deadlines,
  priority,
  onEdit,
}: {
  week: Week;
  materials: Source[];
  deadlines: Deadline[];
  /** Present when this week is among the top "focus next" suggestions. */
  priority?: PriorityItem;
  onEdit: () => void;
}) {
  return (
    <li className={styles.card}>
      <div className={styles.head}>
        <span className={styles.weekNo}>Week {week.week_number}</span>
        {week.start_date && <span className={styles.date}>{formatDate(week.start_date)}</span>}
        {priority && (
          <Tag tone="info" icon={<Target weight="bold" />}>
            <span title={priority.reason}>Focus</span>
          </Tag>
        )}
        <span className={styles.spacer} />
        <IconButton
          size="sm"
          label={`Edit week ${week.week_number}`}
          icon={<NotePencil />}
          onClick={onEdit}
        />
      </div>

      <span className={week.title ? styles.title : styles.untitled}>
        {week.title || "Add a topic"}
      </span>
      {week.summary && <p className={styles.summary}>{week.summary}</p>}

      {deadlines.length > 0 && (
        <ul className={styles.deadlines}>
          {deadlines.map((d) => (
            <li key={d.id} className={styles.deadline}>
              <span className={styles.dlIcon} aria-hidden="true">
                {d.type === "assignment" ? <FileText /> : <Exam />}
              </span>
              <span className={styles.dlTitle}>{d.title}</span>
              <span className={styles.dlRel}>{relativeDays(d.due_at)}</span>
            </li>
          ))}
        </ul>
      )}

      {materials.length > 0 ? (
        <ul className={styles.materials}>
          {materials.map((m) => {
            const TypeIcon = TYPE_ICON[m.type];
            return (
              <li key={m.id} className={styles.material}>
                <span className={styles.matIcon} aria-hidden="true">
                  <TypeIcon />
                </span>
                <span className={styles.matTitle}>{m.title}</span>
                {m.ingest_state !== "processed" && (
                  <span className={styles.matState}>{matState(m)}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.noMaterials}>No materials yet</p>
      )}
    </li>
  );
}
