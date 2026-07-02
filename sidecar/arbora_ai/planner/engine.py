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
     targets two sessions per subject per week, `pass` one.
Calm caps: at most one planned session per subject per day, at most two
new study sessions per day overall.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from pydantic import BaseModel

SESSION_MINUTES = 50
MAX_NEW_PER_DAY = 2
DEADLINE_HORIZON_DAYS = 14


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


class MissedIn(BaseModel):
    event_id: str
    subject_id: str | None = None
    title: str
    minutes: int = SESSION_MINUTES


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


class PlanOut(BaseModel):
    sessions: list[SessionOut]
    moves: list[MoveOut]


def _parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def _fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M")


def _weekday_name(dt: datetime) -> str:
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][
        dt.weekday()
    ]


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


def plan_week(
    week_start: date,
    windows: list[WindowIn],
    subjects: list[SubjectIn],
    deadlines: list[DeadlineIn],
    lectures: list[LectureIn],
    busy: list[BusyIn],
    missed: list[MissedIn],
    goal: str | None = None,
    session_minutes: int = SESSION_MINUTES,
    now: datetime | None = None,
) -> PlanOut:
    now = now or datetime.now()
    slots = _expand_slots(week_start, windows, busy, now, session_minutes)
    sessions: list[SessionOut] = []
    moves: list[MoveOut] = []

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
    per_day_new: dict[date, int] = {}
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

    # 3 — subject sessions by need, front-loading close deadlines.
    soonest: dict[str, DeadlineIn] = {}
    for d in sorted(deadlines, key=lambda x: x.due_at):
        if _parse(d.due_at) >= now:
            soonest.setdefault(d.subject_id, d)

    def urgency(sub: SubjectIn) -> float:
        score = min(sub.due_cards, 20) * 0.1
        d = soonest.get(sub.id)
        if d is not None:
            days = max(( _parse(d.due_at) - now).days, 0)
            if days <= DEADLINE_HORIZON_DAYS:
                score += (DEADLINE_HORIZON_DAYS - days) * 1.0 + 3.0
        return score

    target = 2 if goal == "high_gpa" else 1
    queue = sorted(subjects, key=urgency, reverse=True)
    placed: dict[str, int] = {}
    subject_days: dict[str, set[date]] = {}

    for _round in range(target + 1):
        for sub in queue:
            extra = 1 if sub.id in soonest else 0
            if placed.get(sub.id, 0) >= target + extra:
                continue

            def free(s: _Slot, sub_id: str = sub.id) -> bool:
                day = s.start.date()
                if per_day_new.get(day, 0) >= MAX_NEW_PER_DAY:
                    return False
                return day not in subject_days.get(sub_id, set())

            slot = _take_first(slots, free)
            if slot is None:
                continue
            placed[sub.id] = placed.get(sub.id, 0) + 1
            per_day_new[slot.start.date()] = per_day_new.get(slot.start.date(), 0) + 1
            subject_days.setdefault(sub.id, set()).add(slot.start.date())

            d = soonest.get(sub.id)
            if d is not None:
                days = max((_parse(d.due_at) - now).days, 0)
                reason = f"{d.title} is due in {days} days — starting early helps."
            elif sub.due_cards > 0:
                reason = f"{sub.due_cards} reviews coming due this week."
            else:
                reason = f"Keeps {sub.name} moving."
            sessions.append(
                SessionOut(
                    subject_id=sub.id,
                    title=f"Study {sub.name}",
                    start_at=_fmt(slot.start),
                    end_at=_fmt(slot.end),
                    reason=reason,
                )
            )

    sessions.sort(key=lambda s: s.start_at)
    return PlanOut(sessions=sessions, moves=moves)
