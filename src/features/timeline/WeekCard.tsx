import {
  Exam,
  FileDoc,
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
  doc: FileDoc,
  text: FileText,
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

      <WeekPlan week={week} />

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

/**
 * The week's plan detail, as read out of the syllabus by the deep pass: what the
 * lecture and lab cover, what's due, what to be able to do by the end of it, and
 * what to have finished. Renders nothing until a plan is accepted, so a manually
 * built outline looks exactly as it did before.
 */
function WeekPlan({ week }: { week: Week }) {
  const hasRows = week.lecture || week.lab || week.assessment_note;
  const hasLists = week.focus.length > 0 || week.deliverables.length > 0;
  if (!hasRows && !hasLists) return null;

  return (
    <div className={styles.plan}>
      {hasRows && (
        <dl className={styles.planRows}>
          {week.lecture && (
            <div className={styles.planRow}>
              <dt>Lecture</dt>
              <dd>{week.lecture}</dd>
            </div>
          )}
          {week.lab && (
            <div className={styles.planRow}>
              <dt>Lab</dt>
              <dd>{week.lab}</dd>
            </div>
          )}
          {week.assessment_note && (
            <div className={styles.planRow}>
              <dt>Due</dt>
              <dd className={styles.planDue}>{week.assessment_note}</dd>
            </div>
          )}
        </dl>
      )}

      {week.focus.length > 0 && (
        <div className={styles.planList}>
          <h4 className={styles.planListTitle}>Focus this week</h4>
          <ul>
            {week.focus.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {week.deliverables.length > 0 && (
        <div className={styles.planList}>
          <h4 className={styles.planListTitle}>By the end of the week</h4>
          <ul>
            {week.deliverables.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
