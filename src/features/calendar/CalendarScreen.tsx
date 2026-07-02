import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, Check, Sparkle } from "@phosphor-icons/react";
import { Button } from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { api } from "../../lib/api";
import type { CalendarEvent, SchedulePlan } from "../../lib/types";
import { ScheduleProposalCard } from "./ScheduleProposalCard";
import {
  addDays,
  addMinutes,
  fmtDayLabel,
  fmtMonth,
  fmtTime,
  monthGrid,
  parseNaive,
  sameDay,
  startOfWeek,
  toNaive,
} from "./dates";
import { EventModal, type EventDraft } from "./EventModal";
import styles from "./CalendarScreen.module.css";

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 23;
const PX_PER_HOUR = 48;
const PX_PER_MIN = PX_PER_HOUR / 60;
const SNAP_MIN = 30;
const DRAG_THRESHOLD = 5;

type View = "week" | "month";
type ModalState = { event: CalendarEvent | null; draft: EventDraft | null } | null;

/** Minutes since the top of the visible grid (clamped). */
function minutesIntoDay(iso: string): number {
  const d = parseNaive(iso);
  const mins = d.getHours() * 60 + d.getMinutes() - DAY_START_HOUR * 60;
  return Math.max(0, Math.min(mins, (DAY_END_HOUR - DAY_START_HOUR) * 60));
}

/** S-Calendar (redesign §3.4, no AI yet): week/month timetable with manual
 * CRUD and drag-to-reschedule. Deadlines use earth gold, never red. */
export function CalendarScreen() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    event: CalendarEvent;
    startX: number;
    startY: number;
    moved: boolean;
    preview: { start_at: string; end_at: string } | null;
  } | null>(null);
  const [, forceRender] = useState(0);

  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Load events for the visible range.
  useEffect(() => {
    const from = view === "week" ? weekStart : startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    const to = view === "week" ? addDays(from, 7) : addDays(from, 42);
    api
      .listEvents(toNaive(from), toNaive(to))
      .then(setEvents)
      .catch(() => setEvents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor.getTime(), refreshTick]);

  // ── AI week planner (proposals only until accepted — law #2) ─────────────

  async function requestPlan() {
    setPlanning(true);
    setPlanNote("");
    try {
      const weekStart = toNaive(startOfWeek(anchor)).split("T")[0];
      const result = await api.proposeSchedule(weekStart);
      setPlan(result);
      if (result.sessions.length === 0 && result.moves.length === 0) {
        setPlanNote(
          "No suggestions for this week. Set your weekly study windows in Settings so the planner knows when you're free.",
        );
      }
    } catch (e) {
      setPlanNote(
        String(e).includes("SIDECAR_UNAVAILABLE")
          ? "The AI is still getting ready. Try again in a moment."
          : "Couldn't build a plan right now.",
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
    setRefreshTick((n) => n + 1);
  }

  async function acceptMove(index: number, times: { start_at: string; end_at: string }) {
    if (!plan) return;
    const move = { ...plan.moves[index], ...times };
    await api.acceptSchedule([], [move]);
    setPlan({ ...plan, moves: plan.moves.filter((_, i) => i !== index) });
    setRefreshTick((n) => n + 1);
  }

  async function acceptAll() {
    if (!plan) return;
    await api.acceptSchedule(plan.sessions, plan.moves);
    setPlan(null);
    setRefreshTick((n) => n + 1);
  }

  function patchEvent(saved: CalendarEvent) {
    setEvents((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx === -1) return [...prev, saved];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
  }

  function step(direction: 1 | -1) {
    setAnchor((a) =>
      view === "week"
        ? addDays(a, direction * 7)
        : new Date(a.getFullYear(), a.getMonth() + direction, 1),
    );
  }

  // ── Week-view interactions ────────────────────────────────────────────────

  function slotFromClick(dayIndex: number, offsetY: number): EventDraft {
    const mins = Math.floor(offsetY / PX_PER_MIN / 60) * 60; // snap to the hour
    const start = addMinutes(
      new Date(days[dayIndex].getFullYear(), days[dayIndex].getMonth(), days[dayIndex].getDate(), DAY_START_HOUR),
      mins,
    );
    const end = addMinutes(start, 60);
    return {
      date: toNaive(start).split("T")[0],
      start: toNaive(start).split("T")[1],
      end: toNaive(end).split("T")[1],
    };
  }

  function onEventPointerDown(e: React.PointerEvent, event: CalendarEvent) {
    e.stopPropagation();
    dragRef.current = { event, startX: e.clientX, startY: e.clientY, moved: false, preview: null };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onEventPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const grid = gridRef.current;
    if (!drag || !grid) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;

    const colWidth = grid.getBoundingClientRect().width / 7;
    const deltaDays = Math.round(dx / colWidth);
    const deltaMins = Math.round(dy / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
    const start = addMinutes(addDays(parseNaive(drag.event.start_at), deltaDays), deltaMins);
    const end = addMinutes(addDays(parseNaive(drag.event.end_at), deltaDays), deltaMins);
    drag.preview = { start_at: toNaive(start), end_at: toNaive(end) };
    forceRender((n) => n + 1);
  }

  function onEventPointerUp(event: CalendarEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      setModal({ event, draft: null });
      return;
    }
    if (drag.preview) {
      const { start_at, end_at } = drag.preview;
      void api.moveEvent(event.id, start_at, end_at).then(patchEvent);
      // Optimistic: show the drop position immediately.
      patchEvent({ ...event, start_at, end_at });
    }
  }

  const now = new Date();
  const nowOffset = (now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60) * PX_PER_MIN;
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);

  return (
    <div className={styles.screen}>
      <TopBar />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.h1}>Calendar</h1>
          <div className={styles.controls}>
            <Button
              variant="primary"
              size="sm"
              icon={<Sparkle />}
              onClick={() => void requestPlan()}
              disabled={planning}
            >
              {planning ? "Planning…" : "AI plan this week"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <div className={styles.nav}>
              <button type="button" className={styles.navBtn} aria-label="Previous" onClick={() => step(-1)}>
                <CaretLeft />
              </button>
              <span className={styles.rangeLabel}>
                {view === "week" ? `${fmtDayLabel(days[0])} – ${fmtDayLabel(days[6])}` : fmtMonth(anchor)}
              </span>
              <button type="button" className={styles.navBtn} aria-label="Next" onClick={() => step(1)}>
                <CaretRight />
              </button>
            </div>
            <div className={styles.segmented} role="group" aria-label="Calendar view">
              {(["week", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.segment} ${view === v ? styles.segmentActive : ""}`}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {v === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {planNote && <p className={styles.planNote}>{planNote}</p>}
        {plan && plan.sessions.length + plan.moves.length > 0 && (
          <section className={styles.proposals} aria-label="AI schedule proposals">
            <div className={styles.proposalsHeader}>
              <span className={styles.proposalsTitle}>
                Suggested sessions — nothing is saved until you accept.
              </span>
              <div className={styles.proposalsActions}>
                <Button size="sm" variant="secondary" onClick={() => void acceptAll()}>
                  Accept all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPlan(null)}>
                  Dismiss all
                </Button>
              </div>
            </div>
            <div className={styles.proposalsGrid}>
              {plan.moves.map((m, i) => (
                <ScheduleProposalCard
                  key={`move-${m.event_id}`}
                  proposal={{ ...m, isMove: true }}
                  onAccept={(times) => void acceptMove(i, times)}
                  onDismiss={() => setPlan({ ...plan, moves: plan.moves.filter((_, j) => j !== i) })}
                />
              ))}
              {plan.sessions.map((s, i) => (
                <ScheduleProposalCard
                  key={`s-${i}-${s.start_at}`}
                  proposal={s}
                  onAccept={(times) => void acceptSession(i, times)}
                  onDismiss={() =>
                    setPlan({ ...plan, sessions: plan.sessions.filter((_, j) => j !== i) })
                  }
                />
              ))}
            </div>
          </section>
        )}

        {view === "week" ? (
          <div className={styles.weekWrap}>
            <div className={styles.dayHeaders}>
              <div className={styles.gutterSpacer} />
              {days.map((d) => (
                <div key={d.getTime()} className={`${styles.dayHeader} ${sameDay(d, now) ? styles.today : ""}`}>
                  {fmtDayLabel(d)}
                </div>
              ))}
            </div>
            <div className={styles.weekScroll}>
              <div className={styles.gutter}>
                {hours.map((h) => (
                  <div key={h} className={styles.hourLabel}>
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              <div className={styles.grid} ref={gridRef}>
                {days.map((d, di) => (
                  <div
                    key={d.getTime()}
                    className={styles.dayCol}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setModal({ event: null, draft: slotFromClick(di, e.clientY - rect.top) });
                    }}
                  >
                    {hours.map((h) => (
                      <div key={h} className={styles.hourCell} />
                    ))}
                    {sameDay(d, now) && nowOffset > 0 && nowOffset < (DAY_END_HOUR - DAY_START_HOUR) * 60 * PX_PER_MIN && (
                      <div className={styles.nowLine} style={{ top: nowOffset }} aria-hidden="true" />
                    )}
                    {events
                      .filter((ev) => {
                        const shown = dragRef.current?.event.id === ev.id && dragRef.current.preview
                          ? dragRef.current.preview.start_at
                          : ev.start_at;
                        return sameDay(parseNaive(shown), d);
                      })
                      .map((ev) => {
                        const preview = dragRef.current?.event.id === ev.id ? dragRef.current.preview : null;
                        const startIso = preview?.start_at ?? ev.start_at;
                        const endIso = preview?.end_at ?? ev.end_at;
                        const top = minutesIntoDay(startIso) * PX_PER_MIN;
                        const height = Math.max(
                          (minutesIntoDay(endIso) - minutesIntoDay(startIso)) * PX_PER_MIN,
                          20,
                        );
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            className={`${styles.event} ${styles[ev.kind]} ${ev.status === "done" ? styles.done : ""} ${preview ? styles.dragging : ""}`}
                            style={{ top, height }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => onEventPointerDown(e, ev)}
                            onPointerMove={onEventPointerMove}
                            onPointerUp={() => onEventPointerUp(ev)}
                          >
                            <span className={styles.eventTitle}>
                              {ev.status === "done" && <Check weight="bold" aria-label="Done" />}
                              {ev.title}
                            </span>
                            <span className={styles.eventTime}>
                              {fmtTime(startIso)} – {fmtTime(endIso)}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.monthGrid}>
            {monthGrid(anchor).map((row, ri) =>
              row.map((d) => {
                const dayEvents = events.filter((ev) => sameDay(parseNaive(ev.start_at), d));
                const inMonth = d.getMonth() === anchor.getMonth();
                return (
                  <button
                    key={`${ri}-${d.getTime()}`}
                    type="button"
                    className={`${styles.monthCell} ${inMonth ? "" : styles.outside} ${sameDay(d, now) ? styles.today : ""}`}
                    onClick={() => {
                      setAnchor(d);
                      setView("week");
                    }}
                  >
                    <span className={styles.monthDay}>{d.getDate()}</span>
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span key={ev.id} className={`${styles.monthEvent} ${styles[ev.kind]}`}>
                        {ev.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className={styles.moreCount}>+{dayEvents.length - 3} more</span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        )}
      </main>

      <EventModal
        open={modal !== null}
        event={modal?.event ?? null}
        draft={modal?.draft ?? null}
        onClose={() => setModal(null)}
        onSaved={patchEvent}
        onDeleted={(id) => setEvents((prev) => prev.filter((e) => e.id !== id))}
      />
    </div>
  );
}
