"""Rule-based week planner.

Deliberately NOT an LLM: fitting sessions into free windows is constraint
packing, which rules do deterministically, instantly, and identically on the
🌱 preset (vault risk table: "Ưu tiên logic quy tắc; LLM chỉ tinh chỉnh").
The pet's LLM only routes the *request*; the plan itself comes from here.

Everything returned is a PROPOSAL — the Rust core writes nothing until the
user accepts (law #2). Reasons are calm, pre-built phrases: no "late", no
countdown pressure (a11y-adhd).

Placement policy, in priority order:
  1. Missed study sessions move to the next free slot (neutral reschedule).
  2. Each upcoming lecture gets a prep session in the closest slot before it.
  3. Remaining slots go to subjects by need — soonest deadline first
     (front-loaded to the earliest slots), then review volume. `high_gpa`
     targets two sessions per subject per week, `pass` one. A deadline shapes
     the week only inside its type-scaled *run-up* (exam 21 days, assignment 14,
     other 7): within the run-up it adds an extra session and its urgency ramps
     toward the due date; an exam in its final week (≤7 days) adds a second
     extra (ADR-0014). Outside the run-up a deadline adds nothing this week, so
     a far-off due date no longer crams today. Within the chosen day, two
     learned signals bias which slot is claimed (ordering only; day-level
     front-loading is unaffected): a `preferred_hour` pulls toward when the user
     actually studies, and `avoid_slots` — (weekday, hour) pairs the user has
     recently dismissed — steer away from times they keep declining. A dismissed
     time is still used as a last resort rather than leaving the week
     under-covered.
     If the declared windows can't cover the target (none set, or all full), the
     planner falls back to suggesting sessions at the user's usual hour — or a calm
     evening default when no rhythm is known — clearly marked as movable. Study
     windows are a preference, not a prerequisite: the planner always offers a plan
     rather than dead-ending.
Calm caps: at most one planned session per subject per day, at most two
new study sessions per day overall — so even an exam's +2 lands on two days.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from pydantic import BaseModel

SESSION_MINUTES = 50
MAX_NEW_PER_DAY = 2

# How far before its due date a deadline begins to shape the week — its "run-up",
# scaled by type so an exam earns a longer runway than an assignment, which earns
# more than "other" (ADR-0014). Beyond the run-up a deadline adds no extra session
# and no front-loading this week.
RUNUP_DAYS = {"exam": 21, "assignment": 14, "other": 7}

# In an exam's final stretch the run-up earns a second extra session (ADR-0014):
# still a dismissible proposal, still spread across days by the calm caps,
# exam-only and capped at +2 — never escalating.
EXAM_FINAL_WEEK_DAYS = 7

# How hard each deadline kind pulls a subject forward when slots are scarce
# (ADR-0013). Affects ordering only, never how many sessions a subject needs:
# an exam and an assignment due the same day compete for the slot, exam first.
TYPE_WEIGHT = {"exam": 2.0, "assignment": 1.0, "other": 0.5}

# Fallback suggestions: when the user's declared study windows can't cover the
# week's target, the planner still offers a plan (windows are a preference, not a
# prerequisite) at the user's usual hour, or this calm evening default when no
# rhythm is known yet. A few candidate slots per day leave room to re-roll.
FALLBACK_START_HOUR = 18
FALLBACK_SESSIONS_PER_DAY = 3
FALLBACK_NOTE = "Outside your set windows — move me or add one."


class WindowIn(BaseModel):
    weekday: int  # 0=Monday … 6=Sunday
    start_time: str  # "HH:MM"
    end_time: str


class SubjectIn(BaseModel):
    id: str
    name: str
    due_cards: int = 0  # reviews coming due this week


class DeadlineIn(BaseModel):
    subject_id: str
    title: str
    due_at: str  # naive local ISO
    type: str = "assignment"


class LectureIn(BaseModel):
    subject_id: str | None = None
    title: str
    start_at: str


class BusyIn(BaseModel):
    start_at: str
    end_at: str


class AvoidSlotIn(BaseModel):
    """A (weekday, hour) the user recently dismissed a proposal on — a soft
    "not this time" signal that biases slot choice away from it. Ordering only:
    it never reduces a subject's target, and a dismissed time is still used when
    it is the only free slot left."""

    weekday: int  # 0=Monday … 6=Sunday
    hour: int  # 0–23, local wall clock


class MissedIn(BaseModel):
    event_id: str
    subject_id: str | None = None
    title: str
    minutes: int = SESSION_MINUTES


class ExistingSessionIn(BaseModel):
    """A study session already on the calendar this week (user- or AI-scheduled).

    It is credited toward the subject's weekly target so the planner never
    double-books a subject the user already scheduled — the user's own sessions
    are the optimal reference (vault: "buổi user tự thêm là tối ưu").
    """

    subject_id: str | None = None
    start_at: str
    end_at: str


class SessionOut(BaseModel):
    subject_id: str | None
    title: str
    start_at: str
    end_at: str
    kind: str = "study"
    reason: str


class MoveOut(BaseModel):
    event_id: str
    title: str
    start_at: str
    end_at: str
    reason: str


class SubjectCoverage(BaseModel):
    """How a subject's weekly study target is covered, for the UI's calm
    "N of M planned" indicator and the keep-filling loop's stop condition."""

    subject_id: str
    name: str
    needed: int  # goal-based target (+1 if a deadline is looming)
    scheduled: int  # already on the calendar this week
    proposed: int  # in this proposal


class PlanOut(BaseModel):
    sessions: list[SessionOut]
    moves: list[MoveOut]
    coverage: list[SubjectCoverage] = []
    remaining: int = 0  # total unmet sessions across subjects


def _parse(iso: str) -> datetime:
    """Parse an ISO timestamp into a naive-local datetime.

    The planner works entirely in naive local wall-clock: `now` is
    `datetime.now()` and calendar events are stored naive-local. But a
    UI-created deadline arrives as UTC with a `Z` suffix
    (`new Date(date).toISOString()`), which `fromisoformat` returns as a
    timezone-*aware* value. Mixing the two raises "can't compare offset-naive
    and offset-aware datetimes", so convert any aware value to local time and
    drop the tzinfo — a one-space fix that keeps every comparison valid.
    """
    dt = datetime.fromisoformat(iso)
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt


def _fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M")


def _weekday_name(dt: datetime) -> str:
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][
        dt.weekday()
    ]


def _runup_days(dtype: str) -> int:
    """The type-scaled run-up horizon (days) a deadline shapes the week within."""
    return RUNUP_DAYS.get(dtype, RUNUP_DAYS["assignment"])


def _deadline_extra(d: DeadlineIn, now: datetime) -> int:
    """Extra sessions this deadline adds to its subject's weekly target, given
    where `now` sits in the run-up: 0 before the run-up begins, 1 inside it, 2
    for an exam in its final week (ADR-0014). Bounded — never grows past 2."""
    days = (_parse(d.due_at) - now).days
    if days < 0 or days > _runup_days(d.type):
        return 0
    if d.type == "exam" and days <= EXAM_FINAL_WEEK_DAYS:
        return 2
    return 1


def _fallback_windows(preferred_hour: int | None, session_minutes: int) -> list[WindowIn]:
    """Synthetic daily windows used only when declared study windows can't cover
    the week. Anchored at the user's usual study hour when known, else a calm
    early-evening default, and wide enough for a few candidate slots per day so a
    re-roll has somewhere to go. Same shape as real windows, so slot expansion,
    busy-removal and preference biasing all reuse the normal path."""
    start_h = preferred_hour if preferred_hour is not None else FALLBACK_START_HOUR
    start_min = start_h * 60
    end_min = min(start_min + FALLBACK_SESSIONS_PER_DAY * session_minutes, 23 * 60 + 59)
    start = f"{start_min // 60:02d}:{start_min % 60:02d}"
    end = f"{end_min // 60:02d}:{end_min % 60:02d}"
    return [WindowIn(weekday=wd, start_time=start, end_time=end) for wd in range(7)]


class _Slot:
    def __init__(self, start: datetime, minutes: int):
        self.start = start
        self.end = start + timedelta(minutes=minutes)
        self.taken = False

    def overlaps(self, start: datetime, end: datetime) -> bool:
        return self.start < end and start < self.end


def _expand_slots(
    week_start: date,
    windows: list[WindowIn],
    busy: list[BusyIn],
    now: datetime,
    session_minutes: int,
) -> list[_Slot]:
    """Concrete free session-sized slots for the week, past + busy removed."""
    busy_iv = [(_parse(b.start_at), _parse(b.end_at)) for b in busy]
    slots: list[_Slot] = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        for w in windows:
            if w.weekday != day.weekday():
                continue
            h1, m1 = map(int, w.start_time.split(":"))
            h2, m2 = map(int, w.end_time.split(":"))
            start = datetime(day.year, day.month, day.day, h1, m1)
            end = datetime(day.year, day.month, day.day, h2, m2)
            cursor = start
            while cursor + timedelta(minutes=session_minutes) <= end:
                slot = _Slot(cursor, session_minutes)
                if slot.start >= now and not any(slot.overlaps(b0, b1) for b0, b1 in busy_iv):
                    slots.append(slot)
                cursor += timedelta(minutes=session_minutes)
    slots.sort(key=lambda s: s.start)
    return slots


def _take_first(slots: list[_Slot], pred=None) -> _Slot | None:
    for s in slots:
        if not s.taken and (pred is None or pred(s)):
            s.taken = True
            return s
    return None


def _take_preferred(
    slots: list[_Slot],
    pred,
    preferred_hour: int | None,
    avoid: set[tuple[int, int]],
) -> _Slot | None:
    """Pick a free slot for a subject, shaped by what the planner has learned.

    Two soft signals, both ordering-only — they change which free slot a subject
    claims, never how many it gets:
      • a learned `preferred_hour` pulls the slot toward when the user usually
        studies;
      • `avoid` — (weekday, hour) pairs the user has recently dismissed — pushes
        the slot away from times they keep declining, but only as a tiebreaker:
        a dismissed slot is still used when it is the only one free, so a soft
        signal never leaves the week under-covered.
    The day is always the primary sort key, so deadline front-loading is
    preserved; the signals only reshuffle *within* the chosen day. With no
    preference and nothing to avoid this is plain chronological, identical to
    `_take_first`.
    """
    if preferred_hour is None and not avoid:
        return _take_first(slots, pred)
    best: _Slot | None = None
    best_key: tuple | None = None
    for s in slots:
        if s.taken or not pred(s):
            continue
        is_avoided = (s.start.weekday(), s.start.hour) in avoid
        hour_gap = abs(s.start.hour - preferred_hour) if preferred_hour is not None else 0
        key = (s.start.date(), is_avoided, hour_gap, s.start)
        if best_key is None or key < best_key:
            best, best_key = s, key
    if best is not None:
        best.taken = True
    return best


def plan_week(
    week_start: date,
    windows: list[WindowIn],
    subjects: list[SubjectIn],
    deadlines: list[DeadlineIn],
    lectures: list[LectureIn],
    busy: list[BusyIn],
    missed: list[MissedIn],
    existing: list[ExistingSessionIn] | None = None,
    goal: str | None = None,
    session_minutes: int = SESSION_MINUTES,
    preferred_hour: int | None = None,
    avoid_slots: list[AvoidSlotIn] | None = None,
    now: datetime | None = None,
) -> PlanOut:
    now = now or datetime.now()
    existing = existing or []
    avoid = {(a.weekday, a.hour) for a in (avoid_slots or [])}
    slots = _expand_slots(week_start, windows, busy, now, session_minutes)
    sessions: list[SessionOut] = []
    moves: list[MoveOut] = []

    # Sessions already on the calendar this week (user- or AI-scheduled): credit
    # them so the planner fills only the *gap*, and count their daily load in the
    # calm caps. The user's own sessions are the optimal reference.
    scheduled_count: dict[str, int] = {}
    existing_days: dict[str, set[date]] = {}
    existing_per_day: dict[date, int] = {}
    for ex in existing:
        day = _parse(ex.start_at).date()
        existing_per_day[day] = existing_per_day.get(day, 0) + 1
        if ex.subject_id is not None:
            scheduled_count[ex.subject_id] = scheduled_count.get(ex.subject_id, 0) + 1
            existing_days.setdefault(ex.subject_id, set()).add(day)

    # 1 — missed sessions: neutral reschedule into the next free slot.
    for m in missed:
        slot = _take_first(slots)
        if slot is None:
            break
        moves.append(
            MoveOut(
                event_id=m.event_id,
                title=m.title,
                start_at=_fmt(slot.start),
                end_at=_fmt(slot.start + timedelta(minutes=m.minutes)),
                reason=f"Not finished yet? {_weekday_name(slot.start)} "
                f"{slot.start.strftime('%H:%M')} is free.",
            )
        )

    # 2 — lecture prep: closest free slot before each lecture.
    per_day_new: dict[date, int] = dict(existing_per_day)
    for lec in sorted(lectures, key=lambda x: x.start_at):
        lec_start = _parse(lec.start_at)
        candidates = [s for s in slots if not s.taken and s.end <= lec_start]
        if not candidates:
            continue
        slot = candidates[-1]  # closest before the lecture
        slot.taken = True
        per_day_new[slot.start.date()] = per_day_new.get(slot.start.date(), 0) + 1
        sessions.append(
            SessionOut(
                subject_id=lec.subject_id,
                title=f"Prepare: {lec.title}",
                start_at=_fmt(slot.start),
                end_at=_fmt(slot.end),
                reason=f"Before {_weekday_name(lec_start)}'s lecture.",
            )
        )

    # 3 — subject sessions by need, front-loading close deadlines. A deadline
    # counts only inside its type-scaled run-up (ADR-0014): `extra_for` holds the
    # sessions it adds there (0/1/2), `soonest` the earliest future deadline for
    # the calm "due in N days" copy.
    soonest: dict[str, DeadlineIn] = {}
    extra_for: dict[str, int] = {}
    for d in sorted(deadlines, key=lambda x: x.due_at):
        if _parse(d.due_at) >= now:
            soonest.setdefault(d.subject_id, d)
            extra_for[d.subject_id] = max(extra_for.get(d.subject_id, 0), _deadline_extra(d, now))

    def urgency(sub: SubjectIn) -> float:
        score = min(sub.due_cards, 20) * 0.1
        d = soonest.get(sub.id)
        if d is not None:
            days = max((_parse(d.due_at) - now).days, 0)
            runup = _runup_days(d.type)
            if days <= runup:
                # Type both scales the run-up and weights the pull, so an exam
                # ramps earlier and outranks an assignment due the same day for a
                # scarce slot (ADR-0013/0014) — ordering only.
                weight = TYPE_WEIGHT.get(d.type, 1.0)
                score += ((runup - days) * 1.0 + 3.0) * weight
        return score

    target = 2 if goal == "high_gpa" else 1
    max_extra = max((extra_for.get(s.id, 0) for s in subjects), default=0)
    queue = sorted(subjects, key=urgency, reverse=True)
    placed: dict[str, int] = dict(scheduled_count)
    subject_days: dict[str, set[date]] = {k: set(v) for k, v in existing_days.items()}

    def run_pass(pass_slots: list[_Slot], *, fallback: bool) -> None:
        """Round-robin the queue into `pass_slots`: one session per subject per
        round until each hits its target+extra or the slots run out. Shared by the
        real-window pass and the fallback pass; `fallback` only tags the reason so
        the UI can mark a suggestion placed outside the user's declared windows."""
        for _round in range(target + max_extra):
            for sub in queue:
                extra = extra_for.get(sub.id, 0)
                if placed.get(sub.id, 0) >= target + extra:
                    continue

                def free(s: _Slot, sub_id: str = sub.id) -> bool:
                    day = s.start.date()
                    if per_day_new.get(day, 0) >= MAX_NEW_PER_DAY:
                        return False
                    return day not in subject_days.get(sub_id, set())

                slot = _take_preferred(pass_slots, free, preferred_hour, avoid)
                if slot is None:
                    continue
                placed[sub.id] = placed.get(sub.id, 0) + 1
                per_day_new[slot.start.date()] = per_day_new.get(slot.start.date(), 0) + 1
                subject_days.setdefault(sub.id, set()).add(slot.start.date())

                d = soonest.get(sub.id)
                if d is not None and extra > 0:
                    days = max((_parse(d.due_at) - now).days, 0)
                    reason = f"{d.title} is due in {days} days — starting early helps."
                elif sub.due_cards > 0:
                    reason = f"{sub.due_cards} reviews coming due this week."
                else:
                    reason = f"Keeps {sub.name} moving."
                if fallback:
                    reason = f"{reason} {FALLBACK_NOTE}"
                sessions.append(
                    SessionOut(
                        subject_id=sub.id,
                        title=f"Study {sub.name}",
                        start_at=_fmt(slot.start),
                        end_at=_fmt(slot.end),
                        reason=reason,
                    )
                )

    run_pass(slots, fallback=False)

    # Fallback: if declared windows couldn't cover every subject's target, suggest
    # sessions at the user's usual hour (or a calm evening default) so the planner
    # always has a plan to offer — windows are a preference, not a prerequisite.
    # Only the leftover gap is filled; already-covered subjects are untouched, and
    # a fully-covered week never falls back. Slots already claimed in the first
    # pass count as busy so a fallback session never overlaps a real-window one.
    if any(placed.get(s.id, 0) < target + extra_for.get(s.id, 0) for s in subjects):
        claimed = [BusyIn(start_at=_fmt(s.start), end_at=_fmt(s.end)) for s in slots if s.taken]
        fb_windows = _fallback_windows(preferred_hour, session_minutes)
        fb_slots = _expand_slots(week_start, fb_windows, busy + claimed, now, session_minutes)
        run_pass(fb_slots, fallback=True)

    # Coverage: how much of each subject's weekly target is now met. `remaining`
    # (unmet sessions) is the keep-filling loop's stop condition — zero means the
    # week is covered; the UI never nags past that.
    coverage: list[SubjectCoverage] = []
    remaining = 0
    for sub in subjects:
        scheduled = scheduled_count.get(sub.id, 0)
        needed = target + extra_for.get(sub.id, 0)
        proposed = placed.get(sub.id, 0) - scheduled
        coverage.append(
            SubjectCoverage(
                subject_id=sub.id,
                name=sub.name,
                needed=needed,
                scheduled=scheduled,
                proposed=proposed,
            )
        )
        remaining += max(0, needed - scheduled - proposed)

    sessions.sort(key=lambda s: s.start_at)
    return PlanOut(sessions=sessions, moves=moves, coverage=coverage, remaining=remaining)


def resuggest_session(
    week_start: date,
    windows: list[WindowIn],
    busy: list[BusyIn],
    subject_id: str | None,
    title: str,
    declined_start_at: str,
    now: datetime | None = None,
    session_minutes: int = SESSION_MINUTES,
    preferred_hour: int | None = None,
    avoid_slots: list[AvoidSlotIn] | None = None,
) -> SessionOut | None:
    """Offer a single different time for one proposed session the user can't make.

    Same slot machinery as the weekly planner (real windows first, then the usual
    fallback), but for one session: the declined slot is blocked so it is never
    handed back, and its (weekday, hour) is added to the soft-avoid set so the
    re-roll steers off that time rather than nudging back to it. `busy` should
    already include the other pending proposals so two suggestions never collide.
    Returns None only when the week has no free time left at all.
    """
    now = now or datetime.now()
    declined = _parse(declined_start_at)
    avoid = {(a.weekday, a.hour) for a in (avoid_slots or [])}
    avoid |= {(declined.weekday(), declined.hour)}
    blocked = [
        *busy,
        BusyIn(
            start_at=_fmt(declined),
            end_at=_fmt(declined + timedelta(minutes=session_minutes)),
        ),
    ]

    real = _expand_slots(week_start, windows, blocked, now, session_minutes)
    slot = _take_preferred(real, lambda s: True, preferred_hour, avoid)
    fallback = False
    if slot is None:
        claimed = [BusyIn(start_at=_fmt(s.start), end_at=_fmt(s.end)) for s in real if s.taken]
        fb_slots = _expand_slots(
            week_start,
            _fallback_windows(preferred_hour, session_minutes),
            blocked + claimed,
            now,
            session_minutes,
        )
        slot = _take_preferred(fb_slots, lambda s: True, preferred_hour, avoid)
        fallback = True
    if slot is None:
        return None

    reason = "Another time that fits your week."
    if fallback:
        reason = f"{reason} {FALLBACK_NOTE}"
    return SessionOut(
        subject_id=subject_id,
        title=title,
        start_at=_fmt(slot.start),
        end_at=_fmt(slot.end),
        reason=reason,
    )
