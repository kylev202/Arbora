import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  Check,
  Circle,
  Compass,
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
import { JourneyOutline, journeyCta, journeyUrl } from "./JourneyPanel";
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

        <WeekGallery
          stages={stages}
          selectedWeekId={selected.week_id}
          onSelect={setSelectedWeekId}
        />

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

// Card geometry — must match .galleryCard width and .galleryTrack gap in CSS.
const CARD_W = 176;
const CARD_GAP = 16;

/**
 * Self-paced weeks as an exhibition gallery: the selected week sits centred and
 * full-strength, its neighbours fanning out to either side, dimmer and smaller
 * the further they are. Two arrows step the focus; clicking any card brings it
 * to the centre. The centred week's materials render below. Deliberately not the
 * top-nav pattern — this is a browse-a-shelf feel, not a section switcher.
 */
function WeekGallery({
  stages,
  selectedWeekId,
  onSelect,
}: {
  stages: PathStage[];
  selectedWeekId: string;
  onSelect: (id: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(0);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewportW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeIndex = Math.max(
    0,
    stages.findIndex((s) => s.week_id === selectedWeekId),
  );
  const step = CARD_W + CARD_GAP;
  const clamp = (i: number) => Math.min(stages.length - 1, Math.max(0, i));

  const go = (dir: -1 | 1) => onSelect(stages[clamp(activeIndex + dir)].week_id);

  // Drag to browse the shelf: the track follows the pointer, then snaps to the
  // nearest week on release. A moved-past-threshold drag suppresses the trailing
  // click so it doesn't also select the card under the pointer.
  const drag = useRef({ startX: 0, active: false, moved: false });
  const suppressClick = useRef(false);
  const [dragDX, setDragDX] = useState(0);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startX: e.clientX, active: true, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    setDragDX(dx);
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    drag.current.active = false;
    suppressClick.current = drag.current.moved;
    setDragDX(0);
    const shift = Math.round(-dx / step);
    if (shift !== 0) onSelect(stages[clamp(activeIndex + shift)].week_id);
  };

  const offset = viewportW / 2 - (activeIndex * step + CARD_W / 2) + dragDX;
  const dragging = drag.current.active;

  return (
    <div className={styles.gallery}>
      <button
        type="button"
        className={styles.galleryArrow}
        onClick={() => go(-1)}
        disabled={activeIndex === 0}
        aria-label="Previous week"
      >
        <CaretLeft weight="bold" aria-hidden="true" />
      </button>

      <div
        className={styles.galleryViewport}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className={styles.galleryTrack}
          role="tablist"
          aria-label="Weeks"
          style={{
            transform: `translateX(${offset}px)`,
            transition: dragging ? "none" : undefined,
            cursor: dragging ? "grabbing" : "grab",
          }}
        >
          {stages.map((s, i) => {
            const distance = Math.abs(i - activeIndex);
            const isActive = i === activeIndex;
            return (
              <button
                key={s.week_id}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={`${styles.galleryCard} ${isActive ? styles.galleryCardActive : ""}`}
                style={{
                  opacity: Math.max(0.14, 1 - distance * 0.42),
                  scale: String(Math.max(0.8, 1 - distance * 0.09)),
                }}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onSelect(s.week_id);
                }}
              >
                <span className={styles.galleryCardWeek}>Week {s.week_number}</span>
                {s.title && <span className={styles.galleryCardTitle}>{s.title}</span>}
                <span className={styles.galleryCardMeta}>
                  {s.total_cards === 0
                    ? "No material"
                    : `${s.mastered_cards}/${s.total_cards} mastered`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className={styles.galleryArrow}
        onClick={() => go(1)}
        disabled={activeIndex === stages.length - 1}
        aria-label="Next week"
      >
        <CaretRight weight="bold" aria-hidden="true" />
      </button>
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
 * This week's session, led by the guided journey: an overview note, one small
 * lesson at a time (note + varied practice questions), then a recall round.
 * The journey's checkpoint map shows what's ahead; before a journey is built,
 * this week's concepts preview stands in. The pre-week check (spacing effect)
 * and the short flashcard shortcuts stay as secondary paths — skippable, never
 * forced.
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
  const walkthrough = useAsync(
    () => api.getWeekWalkthrough(subjectId, stage.week_id),
    [subjectId, stage.week_id],
  );

  const milestones = useMemo(() => {
    const list = (cards.data ?? []).map((c) => ({
      id: c.card.id,
      concept: c.card.front,
      state: MILESTONE_STATE[c.schedule.state],
    }));
    // Finished steps sink so the next small step is always on top.
    return list.sort((a, b) => (a.state === "done" ? 1 : 0) - (b.state === "done" ? 1 : 0));
  }, [cards.data]);

  const wt = walkthrough.data ?? null;
  const openJourney = () => navigate(journeyUrl(subjectId, stage.week_id, stage.week_number));
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
          {wt ? (
            <JourneyOutline walkthrough={wt} />
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
            </>
          )}

          <div className={styles.sessionActions}>
            <Button variant="primary" icon={<Compass weight="fill" />} onClick={openJourney}>
              {wt ? journeyCta(wt) : "Start this week's journey"}
            </Button>
            {prevStage && (
              <Button variant="secondary" icon={<Play weight="fill" />} onClick={startWithCheck}>
                Quick check Week {prevStage.week_number}
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
          <p className={styles.checkHint}>
            The journey walks you through this week's notes and lessons, then a recall round.
            {prevStage && " A quick check of last week first helps it stick — skipping is fine."}
          </p>
        </>
      )}
    </section>
  );
}
