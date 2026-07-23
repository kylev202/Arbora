"""Rule-based week planner: slot expansion, priorities, calm caps, endpoint."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient

from arbora_ai.planner import (
    AvoidSlotIn,
    BusyIn,
    DeadlineIn,
    ExistingSessionIn,
    LectureIn,
    MissedIn,
    SubjectIn,
    WindowIn,
    plan_week,
    resuggest_session,
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
    # Eighteen days out: inside the exam's 21-day run-up but past the final week,
    # so it earns exactly one extra session and front-loads with calm copy.
    deadline = DeadlineIn(subject_id="alg", title="Algebra midterm", due_at="2026-07-24T09:00", type="exam")
    plan = plan_week(WEEK, WINDOWS, [BIO, ALG], [deadline], [], [], [], goal="pass", now=NOW)
    first = plan.sessions[0]
    assert first.subject_id == "alg", "deadline subject gets the earliest slot"
    assert "due in" in first.reason and "starting early" in first.reason
    assert "late" not in first.reason.lower(), "no guilt language"
    # Deadline subject earns an extra session beyond the pass target.
    alg_sessions = [s for s in plan.sessions if s.subject_id == "alg"]
    assert len(alg_sessions) == 2


def test_exam_outranks_assignment_for_a_scarce_slot():
    # One real 50-minute window slot, two subjects each with a deadline five days
    # out — one exam, one assignment. Type weighting (ADR-0013) gives the single
    # real slot to the exam; the assignment still gets a plan, but via the fallback.
    one_slot = [WindowIn(weekday=0, start_time="18:00", end_time="18:50")]
    exam_sub = SubjectIn(id="ex", name="Physics", due_cards=0)
    assign_sub = SubjectIn(id="as", name="History", due_cards=0)
    deadlines = [
        DeadlineIn(subject_id="ex", title="Physics final", due_at="2026-07-10T09:00", type="exam"),
        DeadlineIn(subject_id="as", title="History essay", due_at="2026-07-10T09:00", type="assignment"),
    ]
    plan = plan_week(WEEK, one_slot, [assign_sub, exam_sub], deadlines, [], [], [], goal="pass", now=NOW)
    real = [s for s in plan.sessions if "Outside your set windows" not in s.reason]
    assert len(real) == 1, "only one real-window slot exists"
    assert real[0].subject_id == "ex", "exam wins the scarce real slot"


def test_exam_final_week_earns_two_extra_sessions():
    # An exam four days out is in its final week, so the run-up earns +2 (ADR-0014):
    # on a `pass` target of one the subject gets three sessions — spread across
    # three days by the calm caps, a wider run-up rather than a single-day cram.
    exam = DeadlineIn(subject_id="bio", title="Biology final", due_at="2026-07-10T09:00", type="exam")
    plan = plan_week(WEEK, WINDOWS, [BIO], [exam], [], [], [], goal="pass", now=NOW)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 3, "target one + two final-week extras"
    assert len({s.start_at[:10] for s in bio}) == 3, "one per day — never crammed into one sitting"
    cov = {c.subject_id: c for c in plan.coverage}
    assert (cov["bio"].needed, cov["bio"].proposed) == (3, 3)


def test_far_future_deadline_adds_no_extra_this_week():
    # A deadline three months out is beyond its run-up: no extra session and no
    # "start early" copy this week (ADR-0014 — the run-up turns on near the date).
    far = DeadlineIn(subject_id="bio", title="Biology paper", due_at="2026-10-05T09:00", type="assignment")
    plan = plan_week(WEEK, WINDOWS, [BIO], [far], [], [], [], goal="pass", now=NOW)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1, "just the normal weekly target"
    assert "starting early" not in bio[0].reason, "no run-up copy outside the run-up"
    assert {c.subject_id: c for c in plan.coverage}["bio"].needed == 1


def test_exam_runup_is_longer_than_assignment_runup():
    # Eighteen days out: an exam is inside its 21-day run-up and earns an extra
    # session; an assignment (14-day run-up) is not yet in its run-up and earns
    # none. Type sets the runway length, not only the ordering weight (ADR-0014).
    exam = DeadlineIn(subject_id="ex", title="Physics exam", due_at="2026-07-24T09:00", type="exam")
    essay = DeadlineIn(subject_id="as", title="History essay", due_at="2026-07-24T09:00", type="assignment")
    subjects = [SubjectIn(id="ex", name="Physics"), SubjectIn(id="as", name="History")]
    plan = plan_week(WEEK, WINDOWS, subjects, [exam, essay], [], [], [], goal="pass", now=NOW)
    cov = {c.subject_id: c for c in plan.coverage}
    assert cov["ex"].needed == 2, "exam is inside its longer run-up"
    assert cov["as"].needed == 1, "assignment not yet in its run-up"


def test_utc_z_deadline_is_normalized_not_crashed():
    # A deadline created in the UI is stored as UTC with a `Z` suffix
    # (`new Date(date).toISOString()`), which parses to a *timezone-aware*
    # datetime; `now` and calendar events are naive-local. Before the `_parse`
    # normalization this raised "can't compare offset-naive and offset-aware
    # datetimes" and 500'd the whole plan. Same exam, same run-up, just the wire
    # format the app actually sends — it must plan, not crash.
    deadline = DeadlineIn(
        subject_id="alg", title="Algebra midterm", due_at="2026-07-24T09:00:00.000Z", type="exam"
    )
    plan = plan_week(WEEK, WINDOWS, [BIO, ALG], [deadline], [], [], [], goal="pass", now=NOW)
    assert plan.sessions[0].subject_id == "alg", "aware deadline still front-loads"
    assert {c.subject_id: c for c in plan.coverage}["alg"].needed == 2, "inside the exam run-up"


def test_slots_bias_toward_preferred_study_hour():
    # A single broad Monday window; with a learned afternoon rhythm the lone
    # session lands near 14:00, not at the earliest 08:00 slot. Ordering only —
    # same count, still inside a window, one per subject per day.
    window = [WindowIn(weekday=0, start_time="08:00", end_time="16:00")]
    plan = plan_week(WEEK, window, [BIO], [], [], [], [], goal="pass", now=NOW, preferred_hour=14)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1
    assert datetime.fromisoformat(bio[0].start_at).hour == 14, "placed at the usual hour"


def test_no_preferred_hour_keeps_earliest_slot():
    # Without a learned hour the same window fills chronologically — the default
    # behaviour is unchanged, so the bias never fires uninvited.
    window = [WindowIn(weekday=0, start_time="08:00", end_time="16:00")]
    plan = plan_week(WEEK, window, [BIO], [], [], [], [], goal="pass", now=NOW)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1
    assert datetime.fromisoformat(bio[0].start_at).hour == 8, "earliest slot when no rhythm known"


def test_dismissed_slot_is_avoided_when_another_is_free():
    # The user dismissed a Monday-08:00 proposal before. With a broad window the
    # planner steers off that hour rather than offering it again — the negative
    # feedback signal. Ordering only: still one session, still inside the window.
    window = [WindowIn(weekday=0, start_time="08:00", end_time="16:00")]
    avoid = [AvoidSlotIn(weekday=0, hour=8)]
    plan = plan_week(WEEK, window, [BIO], [], [], [], [], goal="pass", now=NOW, avoid_slots=avoid)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1
    assert datetime.fromisoformat(bio[0].start_at).hour != 8, "steers off the dismissed hour"


def test_dismissed_slot_used_when_it_is_the_only_option():
    # A single 08:00 slot the user dismissed before: coverage beats avoidance, so
    # the session is still placed rather than leaving the week under-covered.
    window = [WindowIn(weekday=0, start_time="08:00", end_time="08:50")]
    avoid = [AvoidSlotIn(weekday=0, hour=8)]
    plan = plan_week(WEEK, window, [BIO], [], [], [], [], goal="pass", now=NOW, avoid_slots=avoid)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1, "a dismissed time is still used rather than dropping coverage"
    assert datetime.fromisoformat(bio[0].start_at).hour == 8


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


def test_existing_user_session_is_credited_not_double_booked():
    # The user already scheduled one Biology session this week; on the `pass`
    # target of one, the planner should propose none more for Biology.
    existing = [ExistingSessionIn(subject_id="bio", start_at="2026-07-06T18:00", end_at="2026-07-06T18:50")]
    busy = [BusyIn(start_at="2026-07-06T18:00", end_at="2026-07-06T18:50")]  # same slot is taken
    plan = plan_week(WEEK, WINDOWS, [BIO], [], [], busy, [], existing=existing, goal="pass", now=NOW)
    assert [s for s in plan.sessions if s.subject_id == "bio"] == []
    cov = {c.subject_id: c for c in plan.coverage}
    assert (cov["bio"].needed, cov["bio"].scheduled, cov["bio"].proposed) == (1, 1, 0)
    assert plan.remaining == 0


def test_existing_partial_coverage_tops_up_to_target():
    # high_gpa target is two; one already scheduled → exactly one more proposed,
    # on a different day (calm cap: one per subject per day).
    existing = [ExistingSessionIn(subject_id="bio", start_at="2026-07-06T18:00", end_at="2026-07-06T18:50")]
    busy = [BusyIn(start_at="2026-07-06T18:00", end_at="2026-07-06T18:50")]
    plan = plan_week(WEEK, WINDOWS, [BIO], [], [], busy, [], existing=existing, goal="high_gpa", now=NOW)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1
    assert not bio[0].start_at.startswith("2026-07-06"), "avoids the day already used"
    cov = {c.subject_id: c for c in plan.coverage}
    assert (cov["bio"].needed, cov["bio"].scheduled, cov["bio"].proposed) == (2, 1, 1)
    assert plan.remaining == 0


def test_remaining_counts_the_unfilled_gap():
    # A week with no free time at all — every day is busy, so even the evening
    # fallback has nowhere to land. Both subjects stay unmet and `remaining`
    # reports exactly the gap (the keep-filling loop's honest stop signal).
    windows = [WindowIn(weekday=0, start_time="18:00", end_time="20:00")]
    busy = [
        BusyIn(start_at=f"2026-07-{6 + d:02d}T00:00", end_at=f"2026-07-{6 + d:02d}T23:59")
        for d in range(7)
    ]
    plan = plan_week(WEEK, windows, [BIO, ALG], [], [], busy, [], goal="pass", now=NOW)
    assert plan.sessions == [], "no free time anywhere — not even the fallback"
    assert plan.remaining == 2, "both subjects' single session unmet"
    total_proposed = sum(c.proposed for c in plan.coverage)
    assert total_proposed == len(plan.sessions)
    assert plan.remaining == sum(max(0, c.needed - c.scheduled - c.proposed) for c in plan.coverage)


def test_fallback_suggests_when_no_windows_set():
    # No study windows at all: the planner still proposes a plan — windows are a
    # preference, not a prerequisite (user's ask) — at the calm evening default,
    # clearly marked as movable.
    plan = plan_week(WEEK, [], [BIO], [], [], [], [], goal="pass", now=NOW)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1, "planner suggests even without windows"
    assert datetime.fromisoformat(bio[0].start_at).hour == 18, "calm evening default"
    assert "Outside your set windows" in bio[0].reason, "clearly marked as a fallback"
    cov = {c.subject_id: c for c in plan.coverage}["bio"]
    assert (cov.proposed, plan.remaining) == (1, 0)


def test_fallback_uses_learned_hour_when_known():
    # With a learned rhythm the fallback anchors at the user's usual hour rather
    # than the generic evening default.
    plan = plan_week(WEEK, [], [BIO], [], [], [], [], goal="pass", now=NOW, preferred_hour=15)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1
    assert datetime.fromisoformat(bio[0].start_at).hour == 15, "anchored at the learned hour"


def test_windows_are_used_before_fallback():
    # When declared windows cover the target, nothing falls back: the session
    # lands inside a window and carries no fallback marker.
    plan = plan_week(WEEK, WINDOWS, [BIO], [], [], [], [], goal="pass", now=NOW)
    bio = [s for s in plan.sessions if s.subject_id == "bio"]
    assert len(bio) == 1
    assert datetime.fromisoformat(bio[0].start_at).weekday() in {0, 2, 5}, "inside a declared window"
    assert "Outside your set windows" not in bio[0].reason, "no fallback marker when windows suffice"


def test_calm_caps_one_per_subject_per_day():
    plan = plan_week(WEEK, WINDOWS, [BIO], [], [], [], [], goal="high_gpa", now=NOW)
    days = [s.start_at[:10] for s in plan.sessions if s.subject_id == "bio"]
    assert len(days) == len(set(days)), "never two sessions of one subject on a day"


def test_resuggest_offers_a_different_slot():
    # The user can't make the planner's first pick; "Another time" hands back a
    # genuinely different, valid future slot for the same session.
    first = plan_week(WEEK, WINDOWS, [BIO], [], [], [], [], goal="pass", now=NOW).sessions[0]
    alt = resuggest_session(
        WEEK, WINDOWS, [], subject_id="bio", title=first.title,
        declined_start_at=first.start_at, now=NOW,
    )
    assert alt is not None
    assert alt.start_at != first.start_at, "a genuinely different time"
    assert datetime.fromisoformat(alt.start_at) >= NOW
    assert alt.subject_id == "bio" and alt.title == first.title


def test_resuggest_never_collides_with_a_sibling():
    # A sibling proposal already holds Wednesday 18:00 (passed in as busy); the
    # re-roll must not return that exact slot.
    sibling = BusyIn(start_at="2026-07-08T18:00", end_at="2026-07-08T18:50")
    alt = resuggest_session(
        WEEK, WINDOWS, [sibling], subject_id="bio", title="Study Biology",
        declined_start_at="2026-07-06T18:00", now=NOW,
    )
    assert alt is not None
    assert alt.start_at != "2026-07-08T18:00", "never lands on a sibling's slot"


def test_resuggest_falls_back_without_windows():
    # No windows: the re-roll uses the same evening fallback as the weekly planner,
    # clearly marked, and still avoids the declined time.
    alt = resuggest_session(
        WEEK, [], [], subject_id="bio", title="Study Biology",
        declined_start_at="2026-07-06T18:00", now=NOW,
    )
    assert alt is not None
    assert alt.start_at != "2026-07-06T18:00"
    assert "Outside your set windows" in alt.reason


def test_resuggest_returns_none_when_week_is_full():
    # A fully-booked week has no other time to offer — the caller shows a calm note.
    busy = [
        BusyIn(start_at=f"2026-07-{6 + d:02d}T00:00", end_at=f"2026-07-{6 + d:02d}T23:59")
        for d in range(7)
    ]
    alt = resuggest_session(
        WEEK, WINDOWS, busy, subject_id="bio", title="Study Biology",
        declined_start_at="2026-07-06T18:00", now=NOW,
    )
    assert alt is None


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
    assert set(out) == {"sessions", "moves", "coverage", "remaining"}
    bad = client.post(
        "/schedule-plan",
        json={**body, "week_start": "not-a-date"},
        headers={"X-Arbora-Token": "secret"},
    )
    assert bad.status_code == 400


def test_resuggest_endpoint_round_trip(monkeypatch):
    monkeypatch.setenv("ARBORA_SIDECAR_TOKEN", "secret")
    client = TestClient(app)
    # The endpoint derives its own clock (real `now`), so plan a future Monday —
    # otherwise every slot is in the past and there's nothing to suggest.
    today = date.today()
    monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)
    declined = f"{monday.isoformat()}T18:00"
    body = {
        "week_start": monday.isoformat(),
        "windows": [w.model_dump() for w in WINDOWS],
        "title": "Study Biology",
        "subject_id": "bio",
        "declined_start_at": declined,
    }
    assert client.post("/resuggest-session", json=body).status_code == 401
    resp = client.post("/resuggest-session", json=body, headers={"X-Arbora-Token": "secret"})
    assert resp.status_code == 200
    alt = resp.json()
    assert alt is not None and alt["start_at"] != declined
    assert set(alt) >= {"subject_id", "title", "start_at", "end_at", "reason"}
