import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarBlank, CheckCircle, Sparkle, Target, X } from "@phosphor-icons/react";
import { Button, EmptyState, IconButton, Tabs, type TabItem } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/date";
import type { SchedulePlan, SubjectCoverage } from "../../lib/types";
import { ScheduleProposalCard } from "../calendar/ScheduleProposalCard";
import { DeadlinesPanel } from "./DeadlinesPanel";
import { TimelinePanel } from "../timeline/TimelinePanel";
import styles from "./PlanningScreen.module.css";

type PlanTab = "plan" | "deadlines" | "timeline";

/**
 * Subject page 2 of 3 — Plan: one clear view of the study plan and the run-up
 * to deadlines. Three cleanly separated sections as sub-tabs: Plan (focus
 * suggestions + scheduled sessions + AI week proposal), Deadlines (edit and
 * work with deadlines, briefs, grades), Timeline (the semester's week spine).
 */
export function PlanningScreen() {
  const { subjectId = "" } = useParams();
  const [tab, setTab] = useState<PlanTab>("plan");

  const items: TabItem<PlanTab>[] = [
    { id: "plan", label: "Plan" },
    { id: "deadlines", label: "Deadlines" },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Plan</h1>
      </div>

      <Tabs items={items} value={tab} onChange={setTab} label="Planning sections" />

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {tab === "plan" && <PlanPanel subjectId={subjectId} />}
        {tab === "deadlines" && <DeadlinesPanel subjectId={subjectId} />}
        {tab === "timeline" && <TimelinePanel subjectId={subjectId} />}
      </div>
    </div>
  );
}

/** ISO date (YYYY-MM-DD) of this week's Monday, local time. */
function mondayISO(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${monday.getFullYear()}-${m}-${d}`;
}

/**
 * The plan itself: what to focus on next (priority engine), the study sessions
 * already on the calendar for this subject, and a one-click AI week proposal —
 * every AI session is accept-gated (law #2).
 */
function PlanPanel({ subjectId }: { subjectId: string }) {
  const [reload, setReload] = useState(0);
  const focus = useAsync(() => api.getPriorityQueue(subjectId), [subjectId]);
  const events = useAsync(() => api.listEvents(), [subjectId, reload]);

  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState("");
  const [coverage, setCoverage] = useState<SubjectCoverage | null>(null);
  const [rerolling, setRerolling] = useState<number | null>(null);

  const focusItems = (focus.data ?? []).slice(0, 3);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events.data ?? [])
    .filter((e) => e.subject_id === subjectId && e.kind === "study" && e.start_at >= today)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 8);

  const pending = plan?.sessions.length ?? 0;
  const isCovered = coverage != null && coverage.scheduled >= coverage.needed;

  async function proposeWeek() {
    setPlanning(true);
    setPlanNote("");
    try {
      const result = await api.proposeSchedule(mondayISO());
      const mine = result.sessions.filter((s) => s.subject_id === subjectId || s.subject_id == null);
      const cov = result.coverage.find((c) => c.subject_id === subjectId) ?? null;
      setPlan({ ...result, sessions: mine, moves: [] });
      setCoverage(cov);
      if (mine.length === 0 && !(cov && cov.scheduled >= cov.needed)) {
        // The planner falls back to your usual hours when no window fits, so
        // nothing at all means the week itself has no free time left.
        setPlanNote("Your week looks fully booked — no free time to place a session. Free up a slot on the calendar and try again.");
      }
    } catch (e) {
      setPlanNote(
        String(e).includes("SIDECAR_UNAVAILABLE")
          ? "AI sidecar is not ready. Wait a moment and try again."
          : "Couldn't build a proposal right now. Try again in a moment.",
      );
    } finally {
      setPlanning(false);
    }
  }

  async function acceptSession(index: number, times: { start_at: string; end_at: string }) {
    if (!plan) return;
    const session = { ...plan.sessions[index], ...times };
    await api.acceptSchedule([session], []);
    setPlan({ ...plan, sessions: plan.sessions.filter((_, i) => i !== index) });
    // Accepting one session moves it from "proposed" to "scheduled" — keep the
    // coverage line honest so "✓ covered" appears the moment the target is met.
    if (session.subject_id === subjectId) {
      setCoverage((c) =>
        c ? { ...c, scheduled: c.scheduled + 1, proposed: Math.max(0, c.proposed - 1) } : c,
      );
    }
    setReload((r) => r + 1);
  }

  // "Another time" — the user can't make this slot; ask the planner for a
  // different one and swap just this card. The other pending cards go along as
  // `others` so the alternative never lands on one of them. Nothing is written
  // (law #2); a `null` means the week has no other free time.
  async function anotherTime(index: number) {
    if (!plan) return;
    setRerolling(index);
    setPlanNote("");
    try {
      const others = plan.sessions.filter((_, j) => j !== index);
      const alt = await api.resuggestSession(plan.sessions[index], mondayISO(), others);
      if (alt) {
        setPlan({ ...plan, sessions: plan.sessions.map((s, j) => (j === index ? alt : s)) });
      } else {
        setPlanNote("No other free time this week — try freeing up a slot on the calendar.");
      }
    } catch {
      setPlanNote("Couldn't find another time right now. Try again in a moment.");
    } finally {
      setRerolling(null);
    }
  }

  return (
    <>
      {/* ── Focus next ── */}
      {focusItems.length > 0 && (
        <section className={styles.section} aria-label="What to focus on next">
          <h2 className={styles.sectionTitle}>Focus next</h2>
          <ul className={styles.focusList}>
            {focusItems.map((p) => (
              <li key={p.week_id}>
                <Link to={`/subject/${subjectId}/study`} className={styles.focusItem}>
                  <span className={styles.focusIcon} aria-hidden="true">
                    <Target weight="bold" />
                  </span>
                  <span className={styles.focusText}>
                    <span className={styles.focusWeek}>
                      Week {p.week_number}
                      {p.title ? ` · ${p.title}` : ""}
                    </span>
                    <span className={styles.focusReason}>{p.reason}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Scheduled study sessions ── */}
      <section className={styles.section} aria-label="Scheduled study sessions">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Study sessions</h2>
          {/* Hide the button while proposals are pending (accept/dismiss first)
              and once the subject's weekly target is met. */}
          {pending === 0 && !isCovered && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Sparkle weight="fill" />}
              onClick={() => void proposeWeek()}
              disabled={planning}
            >
              {planning ? "Planning…" : coverage ? "Plan the rest" : "Plan my week"}
            </Button>
          )}
        </div>

        {coverage && (
          <p
            className={`${styles.coverage} ${isCovered ? styles.coverageDone : ""}`}
            role="status"
          >
            {isCovered ? (
              <>
                <CheckCircle weight="fill" aria-hidden="true" />
                Your week is covered — {coverage.scheduled} of {coverage.needed} sessions planned.
              </>
            ) : (
              <>
                {coverage.scheduled} of {coverage.needed} sessions planned this week.
              </>
            )}
          </p>
        )}

        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarBlank />}
            title="No sessions scheduled"
            description="Plan your week here, or add sessions on the calendar. Suggestions only become events after you accept them."
          />
        ) : (
          <ul className={styles.sessionList}>
            {upcoming.map((e) => (
              <li key={e.id} className={styles.session}>
                <span className={styles.sessionWhen}>
                  {formatDate(e.start_at)} · {e.start_at.slice(11, 16)}–{e.end_at.slice(11, 16)}
                </span>
                <span className={styles.sessionTitle}>{e.title}</span>
                <IconButton
                  size="sm"
                  label={`Delete ${e.title}`}
                  icon={<X />}
                  onClick={() => api.deleteEvent(e.id).then(() => setReload((r) => r + 1))}
                />
              </li>
            ))}
          </ul>
        )}
        <p className={styles.calendarHint}>
          Move or reschedule sessions on the <Link to="/calendar">calendar</Link>.
        </p>

        {planNote && (
          <p className={styles.planNote} role="status">
            {planNote}
          </p>
        )}
        {plan && plan.sessions.length > 0 && (
          <div className={styles.proposals} aria-label="Proposed sessions">
            {plan.sessions.map((s, i) => (
              <ScheduleProposalCard
                key={`${s.start_at}-${i}`}
                proposal={s}
                busy={rerolling === i}
                onAccept={(times) => void acceptSession(i, times)}
                onAnotherTime={() => void anotherTime(i)}
                onDismiss={() => {
                  void api.dismissProposal(s).catch(() => {});
                  setPlan({ ...plan, sessions: plan.sessions.filter((_, j) => j !== i) });
                }}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
