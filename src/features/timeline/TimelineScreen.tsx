import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarBlank, NotePencil, Plus, UploadSimple } from "@phosphor-icons/react";
import { Button, EmptyState } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/date";
import type { Deadline, PriorityItem, Source, Week } from "../../lib/types";
import { EditWeekModal, SetupOutlineModal } from "../outline/OutlineEditor";
import { ImportSyllabusModal } from "../outline/ImportSyllabusModal";
import { WeekCard } from "./WeekCard";
import styles from "./TimelineScreen.module.css";

/**
 * S-07c — Timeline: the subject's spine. A vertical run of weeks (the unit
 * outline) with each week's materials and the deadlines that land in it. Setup
 * and per-week editing reuse the outline modals; dates are neutral, never "late".
 */
export function TimelineScreen() {
  const { subjectId = "" } = useParams();
  const [reload, setReload] = useState(0);
  const outline = useAsync(() => api.getOutline(subjectId), [subjectId, reload]);
  const sources = useAsync(() => api.listSources(subjectId), [subjectId, reload]);
  const deadlines = useAsync(() => api.listDeadlines(subjectId), [subjectId, reload]);
  const priority = useAsync(() => api.getPriorityQueue(subjectId), [subjectId, reload]);

  const [editingSetup, setEditingSetup] = useState(false);
  const [editingWeek, setEditingWeek] = useState<Week | null>(null);
  const [importing, setImporting] = useState(false);
  const refresh = () => setReload((r) => r + 1);

  if (outline.status === "loading") {
    return (
      <div className="page">
        <div className="screen-header">
          <h1>Timeline</h1>
        </div>
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  const data = outline.data ?? null;
  const hasOutline = !!data && data.week_count != null;
  const weeks = data?.weeks ?? [];
  const materialsByWeek = groupByWeek(sources.data ?? []);
  const deadlinesByWeek = bucketDeadlines(weeks, deadlines.data ?? []);
  const unassigned = materialsByWeek.get(null)?.length ?? 0;
  // Badge only the top few weeks so the spine stays calm, not a wall of flags.
  const priorityByWeek = topPriority(priority.data ?? [], 3);

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Timeline</h1>
        {hasOutline && (
          <div className={styles.headerActions}>
            <Button
              size="sm"
              variant="secondary"
              icon={<UploadSimple weight="bold" />}
              onClick={() => setImporting(true)}
            >
              Import syllabus
            </Button>
            <Button size="sm" icon={<NotePencil weight="bold" />} onClick={() => setEditingSetup(true)}>
              Edit outline
            </Button>
          </div>
        )}
      </div>

      {!hasOutline ? (
        <EmptyState
          icon={<CalendarBlank />}
          title="Lay out your semester"
          description="Import your syllabus and Arbora pulls out the weeks and deadlines for you to check — or set it up by hand. Each week becomes a place to hang topics, materials, and deadlines."
          action={
            <div className={styles.setupActions}>
              <Button
                variant="primary"
                icon={<UploadSimple weight="bold" />}
                onClick={() => setImporting(true)}
              >
                Import from syllabus
              </Button>
              <Button variant="ghost" icon={<Plus weight="bold" />} onClick={() => setEditingSetup(true)}>
                Enter manually
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <p className={styles.meta}>
            {data?.term_start ? `Starts ${formatDate(data.term_start)}` : "No start date set"} ·{" "}
            {data?.week_count} weeks
          </p>
          <ol className={styles.weeks}>
            {weeks.map((w) => (
              <WeekCard
                key={w.id}
                week={w}
                materials={materialsByWeek.get(w.id) ?? []}
                deadlines={deadlinesByWeek.get(w.id) ?? []}
                priority={priorityByWeek.get(w.id)}
                onEdit={() => setEditingWeek(w)}
              />
            ))}
          </ol>
          {unassigned > 0 && (
            <p className={styles.unassigned}>
              {unassigned} {unassigned === 1 ? "material isn't" : "materials aren't"} assigned to a
              week yet —{" "}
              <Link to={`/subject/${subjectId}/sources`} className={styles.link}>
                assign them in Sources
              </Link>
              .
            </p>
          )}
        </>
      )}

      <SetupOutlineModal
        open={editingSetup}
        onClose={() => setEditingSetup(false)}
        initial={data}
        onSave={async (termStart, weekCount) => {
          await api.setOutline(subjectId, termStart, weekCount);
          setEditingSetup(false);
          refresh();
        }}
      />
      <EditWeekModal
        week={editingWeek}
        onClose={() => setEditingWeek(null)}
        onSave={async (patch) => {
          if (editingWeek) await api.updateWeek(editingWeek.id, patch);
          setEditingWeek(null);
          refresh();
        }}
      />
      <ImportSyllabusModal
        open={importing}
        onClose={() => setImporting(false)}
        subjectId={subjectId}
        onCommitted={refresh}
      />
    </div>
  );
}

/** The top `n` already-ranked priority items, keyed by week id for lookup. */
function topPriority(items: PriorityItem[], n: number): Map<string, PriorityItem> {
  return new Map(items.slice(0, n).map((p) => [p.week_id, p]));
}

/** Group sources by their assigned week id (null = unassigned). */
function groupByWeek(sources: Source[]): Map<string | null, Source[]> {
  const map = new Map<string | null, Source[]>();
  for (const s of sources) {
    const key = s.week_id ?? null;
    const arr = map.get(key);
    if (arr) arr.push(s);
    else map.set(key, [s]);
  }
  return map;
}

/**
 * Bucket each deadline into the week it lands in — the latest week whose start
 * date is on or before the due date (anything before week 1 lands in week 1).
 * Needs dated weeks (a term start); returns empty otherwise.
 */
function bucketDeadlines(weeks: Week[], deadlines: Deadline[]): Map<string, Deadline[]> {
  const map = new Map<string, Deadline[]>();
  const dated = weeks.filter((w) => w.start_date);
  if (dated.length === 0) return map;
  for (const d of deadlines) {
    const due = d.due_at.slice(0, 10);
    let target = dated[0];
    for (const w of dated) {
      const start = w.start_date;
      if (start && start <= due) target = w;
    }
    const arr = map.get(target.id);
    if (arr) arr.push(d);
    else map.set(target.id, [d]);
  }
  return map;
}
