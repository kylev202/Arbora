import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Circle,
  GraduationCap,
  Lightning,
  Plant,
  Play,
  Timer,
} from "@phosphor-icons/react";
import { Button, CitationChip, EmptyState, SproutMotif } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { CardState, PathStage } from "../../lib/types";
import { WeekMaterials } from "./WeekMaterials";
import styles from "./StudyHomeScreen.module.css";

const MILESTONE_CAP = 12;

/**
 * Subject page 3 of 3 — Study. Top: this week's session (the week's knowledge
 * as an overview, broken into one small milestone per concept) with a gentle
 * check of last week's knowledge first from week 2 on. Below: self-paced study
 * across all weeks, each with four materials — Flashcards, Test, Diagram,
 * Ask AI.
 */
export function StudyHomeScreen() {
  const { subjectId = "" } = useParams();
  const path = useAsync(() => api.getSubjectPath(subjectId), [subjectId]);
  const dash = useAsync(() => api.getSubjectDashboard(subjectId), [subjectId]);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);

  if (path.status === "loading" || dash.status === "loading") {
    return (
      <div className="page">
        <div className="screen-header">
          <h1>Study</h1>
        </div>
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  const stages = path.data?.stages ?? [];
  const currentWeekInfo = dash.data?.week_progress.current_week ?? null;
  const dueToday = dash.data?.stats.due_today ?? 0;

  if (stages.length === 0) {
    return (
      <div className="page">
        <div className="screen-header">
          <h1>Study</h1>
        </div>
        <EmptyState
          icon={<SproutMotif />}
          title="Set up your weeks first"
          description="Lay out the semester on the Plan page — each week becomes a study stage with its own materials, tests, and diagrams."
          action={
            <Link to={`/subject/${subjectId}/plan`} className={styles.emptyLink}>
              Go to Plan
            </Link>
          }
        />
      </div>
    );
  }

  // The week to study now: the date-current outline week when known, otherwise
  // the first stage that still has unmastered cards.
  const currentStage =
    (currentWeekInfo && stages.find((s) => s.week_id === currentWeekInfo.week_id)) ??
    stages.find((s) => s.total_cards > 0 && s.mastered_cards < s.total_cards) ??
    stages[0];
  const prevStage =
    stages.find((s) => s.week_number === currentStage.week_number - 1 && s.total_cards > 0) ?? null;

  const selected = stages.find((s) => s.week_id === selectedWeekId) ?? currentStage;

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Study</h1>
        {dueToday > 0 && (
          <span className={styles.dueBadge}>
            <GraduationCap weight="fill" aria-hidden="true" /> {dueToday} due today
          </span>
        )}
      </div>

      <ThisWeekSession
        subjectId={subjectId}
        stage={currentStage}
        prevStage={prevStage}
        summary={currentWeekInfo?.summary ?? ""}
      />

      <section className={styles.selfPaced} aria-label="Self-paced study">
        <div className={styles.selfPacedHead}>
          <h2 className={styles.sectionTitle}>Self-paced study</h2>
          <Link to={`/subject/${subjectId}/map`} className={styles.mapLink}>
            Knowledge map <ArrowRight weight="bold" aria-hidden="true" />
          </Link>
        </div>
        <p className={styles.selfPacedHint}>
          Every week stays open — revisit any of them, at your pace.
        </p>

        <div className={styles.weekChips} role="tablist" aria-label="Weeks">
          {stages.map((s) => {
            const isSelected = s.week_id === selected.week_id;
            return (
              <button
                key={s.week_id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`${styles.weekChip} ${isSelected ? styles.weekChipActive : ""}`}
                onClick={() => setSelectedWeekId(s.week_id)}
              >
                <span className={styles.weekChipTitle}>Week {s.week_number}</span>
                <span className={styles.weekChipMeta}>
                  {s.total_cards === 0 ? "No material" : `${s.mastered_cards}/${s.total_cards}`}
                </span>
              </button>
            );
          })}
        </div>

        <h3 className={styles.selectedWeekTitle}>
          Week {selected.week_number}
          {selected.title ? ` · ${selected.title}` : ""}
        </h3>
        <WeekMaterials subjectId={subjectId} week={selected} />
      </section>

      <NotesSection subjectId={subjectId} />
    </div>
  );
}

/** Approved notes, tucked in a quiet disclosure — reference, not a task. */
function NotesSection({ subjectId }: { subjectId: string }) {
  const notes = useAsync(() => api.listNotes(subjectId), [subjectId]);
  if (!notes.data || notes.data.length === 0) return null;
  return (
    <details className={styles.notes}>
      <summary className={styles.notesSummary}>
        Notes ({notes.data.length})
      </summary>
      <div className={styles.notesList}>
        {notes.data.map((n) => (
          <article key={n.id} className={styles.note}>
            <div className={styles.noteContent}>{n.content}</div>
            <div className={styles.noteCitations}>
              {n.source_refs.map((ref, i) => (
                <CitationChip key={i} source={ref} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

const MILESTONE_STATE: Record<CardState, "done" | "learning" | "new"> = {
  review: "done",
  learning: "learning",
  relearning: "learning",
  new: "new",
};

/**
 * The week's knowledge at a glance: overview text, then one small milestone
 * per concept so a big week becomes a series of finishable steps. From week 2
 * on, the primary path starts with a quick check of last week (spacing effect)
 * — skippable, never forced.
 */
function ThisWeekSession({
  subjectId,
  stage,
  prevStage,
  summary,
}: {
  subjectId: string;
  stage: PathStage;
  prevStage: PathStage | null;
  summary: string;
}) {
  const navigate = useNavigate();
  const cards = useAsync(() => api.getWeekCards(subjectId, stage.week_id, 200), [subjectId, stage.week_id]);

  const milestones = useMemo(() => {
    const list = (cards.data ?? []).map((c) => ({
      id: c.card.id,
      concept: c.card.front,
      state: MILESTONE_STATE[c.schedule.state],
    }));
    // Finished steps sink so the next small step is always on top.
    return list.sort((a, b) => (a.state === "done" ? 1 : 0) - (b.state === "done" ? 1 : 0));
  }, [cards.data]);

  const withCheck = prevStage !== null;
  const startThisWeek = () => navigate(`/subject/${subjectId}/study/session?week=${stage.week_id}`);
  const startWithCheck = () =>
    prevStage &&
    navigate(
      `/subject/${subjectId}/study/session?week=${prevStage.week_id}&limit=10&then=${stage.week_id}`,
    );

  return (
    <section className={styles.session} aria-label="This week's session">
      <div className={styles.sessionHead}>
        <div className={styles.sessionText}>
          <h2 className={styles.sessionTitle}>
            This week · Week {stage.week_number}
            {stage.title ? ` · ${stage.title}` : ""}
          </h2>
          {summary && <p className={styles.sessionSummary}>{summary}</p>}
        </div>
      </div>

      {stage.total_cards === 0 ? (
        <p className={styles.sessionEmpty}>
          No study material for this week yet.{" "}
          <Link to={`/subject/${subjectId}/overview`}>Add sources and generate content</Link> to
          study it here.
        </p>
      ) : (
        <>
          <ol className={styles.milestones} aria-label="This week's concepts">
            {milestones.slice(0, MILESTONE_CAP).map((m) => (
              <li key={m.id} className={`${styles.milestone} ${styles[m.state]}`}>
                <span className={styles.milestoneIcon} aria-hidden="true">
                  {m.state === "done" ? (
                    <Check weight="bold" />
                  ) : m.state === "learning" ? (
                    <Plant weight="fill" />
                  ) : (
                    <Circle />
                  )}
                </span>
                <span className={styles.milestoneText}>{m.concept}</span>
              </li>
            ))}
          </ol>
          {milestones.length > MILESTONE_CAP && (
            <p className={styles.milestoneMore}>…and {milestones.length - MILESTONE_CAP} more.</p>
          )}

          <div className={styles.sessionActions}>
            {withCheck && prevStage ? (
              <>
                <Button variant="primary" icon={<Play weight="fill" />} onClick={startWithCheck}>
                  Quick check Week {prevStage.week_number}, then start
                </Button>
                <Button variant="secondary" onClick={startThisWeek}>
                  Skip straight to this week
                </Button>
              </>
            ) : (
              <Button variant="primary" icon={<Play weight="fill" />} onClick={startThisWeek}>
                Start this week's session
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<Timer />}
              onClick={() => navigate(`/subject/${subjectId}/study/session?timer=10`)}
            >
              10-minute focus
            </Button>
            <Button
              variant="ghost"
              icon={<Lightning />}
              onClick={() => navigate(`/subject/${subjectId}/study/session?limit=5`)}
            >
              Quick 5
            </Button>
          </div>
          {withCheck && prevStage && (
            <p className={styles.checkHint}>
              A short check of last week before new material helps it stick. Skipping is fine.
            </p>
          )}
        </>
      )}
    </section>
  );
}
