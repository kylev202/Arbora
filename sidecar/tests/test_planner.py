"""Rule-based week planner: slot expansion, priorities, calm caps, endpoint."""

from __future__ import annotations

from datetime import date, datetime

from fastapi.testclient import TestClient

from arbora_ai.planner import (
    BusyIn,
    DeadlineIn,
    LectureIn,
    MissedIn,
    SubjectIn,
    WindowIn,
    plan_week,
)
from arbora_ai.server import app

# The planning week: Monday 2026-07-06. "Now" is Sunday evening before it.
WEEK = date(2026, 7, 6)
NOW = datetime(2026, 7, 5, 20, 0)

WINDOWS = [
    WindowIn(weekday=0, start_time="18:00", end_time="20:00"),  # Mon: 2 slots
    WindowIn(weekday=2, start_time="18:00", end_time="20:00"),  # Wed: 2 slots
    WindowIn(weekday=5, start_time="09:00", end_time="12:00"),  # Sat: 3 slots
]

BIO = SubjectIn(id="bio", name="Biology", due_cards=8)
ALG = SubjectIn(id="alg", name="Algebra", due_cards=0)


def test_sessions_land_inside_windows_only():
    plan = plan_week(WEEK, WINDOWS, [BIO, ALG], [], [], [], [], goal="pass", now=NOW)
    assert plan.sessions, "some sessions proposed"
    for s in plan.sessions:
        start = datetime.fromisoformat(s.start_at)
        assert start.weekday() in {0, 2, 5}
        assert 9 <= start.hour < 20


def test_deadline_subject_is_front_loaded_with_reason():
    deadline = DeadlineIn(subject_id="alg", title="Algebra midterm", due_at="2026-07-10T09:00", type="exam")
    plan = plan_week(WEEK, WINDOWS, [BIO, ALG], [deadline], [], [], [], goal="pass", now=NOW)
    first = plan.sessions[0]
    assert first.subject_id == "alg", "deadline subject gets the earliest slot"
    assert "due in" in first.reason and "starting early" in first.reason
    assert "late" not in first.reason.lower(), "no guilt language"
    # Deadline subject earns an extra session beyond the pass target.
    alg_sessions = [s for s in plan.sessions if s.subject_id == "alg"]
    assert len(alg_sessions) == 2


def test_lecture_gets_prep_before_it():
    lecture = LectureIn(subject_id="bio", title="Genetics II", start_at="2026-07-08T09:00")
    plan = plan_week(WEEK, WINDOWS, [BIO], [], [lecture], [], [], goal="pass", now=NOW)
    preps = [s for s in plan.sessions if s.title.startswith("Prepare:")]
    assert len(preps) == 1
    assert datetime.fromisoformat(preps[0].end_at) <= datetime.fromisoformat(lecture.start_at)
    assert "lecture" in preps[0].reason


def test_missed_session_moves_to_next_free_slot_neutrally():
    missed = MissedIn(event_id="ev1", subject_id="bio", title="Study Biology", minutes=50)
    plan = plan_week(WEEK, WINDOWS, [BIO], [], [], [], [missed], goal="pass", now=NOW)
    assert len(plan.moves) == 1
    move = plan.moves[0]
    assert move.event_id == "ev1"
    assert datetime.fromisoformat(move.start_at) >= NOW
    assert "late" not in move.reason.lower() and "overdue" not in move.reason.lower()


def test_busy_events_are_avoided():
    busy = [BusyIn(start_at="2026-07-06T18:00", end_at="2026-07-06T20:00")]  # blocks Monday
    plan = plan_week(WEEK, WINDOWS, [BIO], [], [], busy, [], goal="pass", now=NOW)
    for s in plan.sessions:
        assert not s.start_at.startswith("2026-07-06"), "Monday fully busy"


def test_calm_caps_one_per_subject_per_day():
    plan = plan_week(WEEK, WINDOWS, [BIO], [], [], [], [], goal="high_gpa", now=NOW)
    days = [s.start_at[:10] for s in plan.sessions if s.subject_id == "bio"]
    assert len(days) == len(set(days)), "never two sessions of one subject on a day"


def test_endpoint_round_trip(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    body = {
        "week_start": "2026-07-06",
        "windows": [w.model_dump() for w in WINDOWS],
        "subjects": [BIO.model_dump()],
        "goal": "pass",
    }
    assert client.post("/schedule-plan", json=body).status_code == 401
    resp = client.post("/schedule-plan", json=body, headers={"X-Arbora-Token": "secret"})
    assert resp.status_code == 200
    out = resp.json()
    assert set(out) == {"sessions", "moves"}
    bad = client.post(
        "/schedule-plan",
        json={**body, "week_start": "not-a-date"},
        headers={"X-Arbora-Token": "secret"},
    )
    assert bad.status_code == 400
