"""Deep unit-plan extraction (unit essentials, mark map, per-week detail).

A fake provider stands in for Ollama so these are fast and deterministic. The
behaviour that matters here is the *degradation* contract: every pass is
optional, so a failure in one must never cost the caller the others.
"""

from __future__ import annotations

from arbora_ai.llm.provider import LLMProvider, LLMSchemaError, LLMUnavailableError
from arbora_ai.outline.plan import (
    WEEKS_PER_BATCH,
    extract_essentials,
    extract_mark_map,
    extract_unit_plan,
    extract_week_details,
)
from arbora_ai.schemas.output import UnitEssentialsExtraction

SYLLABUS = (
    "COS20019 Cloud Computing Architecture\n"
    "Aim: use a cloud platform to build well-architected deployments.\n"
    "Assumed knowledge: PHP, database concepts, SQL.\n"
    "Platform: AWS Academy (ACF and ACA labs).\n"
    "12.5 credit points\n"
    "ULO1 Describe the features and value of cloud computing\n"
    "ULO2 Create and manage cloud services\n"
    "Dr Man Lau, Unit Coordinator, elau@swin.edu.au, Mon 14:00-15:00\n"
    "Week 1: Foundations. Lab: Intro to Linux\n"
    "Week 2: Compute. Lab: ACF Lab 3 EC2\n"
    "Labs 10% Weeks 2-11 Individual\n"
    "Assignment 3 20% Week 12 Group of 3-4\n"
)

ESSENTIALS_PAYLOAD = {
    "aim": "Use a cloud platform to build well-architected deployments.",
    "assumed_knowledge": "PHP, database concepts, SQL.",
    "platform": "AWS Academy (ACF and ACA labs)",
    "credit_points": "12.5 CP",
    "outcomes": [
        {"code": "ULO1", "text": "Describe the features and value of cloud computing"},
        {"code": "ULO2", "text": "Create and manage cloud services"},
    ],
    "staff": [
        {
            "name": "Dr Man Lau",
            "role": "Unit Coordinator",
            "contact": "elau@swin.edu.au",
            "consultation": "Mon 14:00-15:00",
        }
    ],
}

MARK_MAP_PAYLOAD = {
    "assessments": [
        {
            "name": "Labs",
            "weight_percent": 10,
            "due_text": "Weeks 2-11",
            "kind": "Individual",
            "outcomes": "ULO2, ULO3",
        },
        {
            "name": "Assignment 3",
            "weight_percent": 20,
            "due_text": "Week 12",
            "kind": "Group of 3-4",
            "outcomes": "ULO2, ULO3, ULO4",
        },
    ]
}


def week_payload(numbers: list[int]) -> dict:
    return {
        "weeks": [
            {
                "week_number": n,
                "lecture": f"Lecture topic {n}",
                "lab": f"Lab {n}",
                "assessment_note": "Quiz 1" if n == 3 else "",
                "focus": [f"Be able to explain topic {n}"],
                "deliverables": [f"Finish Lab {n}"],
            }
            for n in numbers
        ]
    }


def asked_weeks(prompt: str) -> list[int]:
    """The week numbers a week-detail prompt lists as its batch. Matches the
    bulleted anchor lines only — the syllabus body also says 'Week 1: …'."""
    return [n for n in range(1, 54) if f"- Week {n}: " in prompt]


class FakeProvider(LLMProvider):
    """Answers each pass from its schema shape; records the prompts it saw."""

    def __init__(self, payload: dict | None = None):
        self._payload = payload
        self.prompts: list[str] = []

    def health(self) -> bool:
        return True

    def generate(self, prompt, schema=None, temperature=0.1):
        self.prompts.append(prompt)
        if self._payload is not None:
            return self._payload
        props = (schema or {}).get("properties", {})
        if "aim" in props:
            return ESSENTIALS_PAYLOAD
        if "assessments" in props:
            return MARK_MAP_PAYLOAD
        # Week batch: answer exactly the weeks this prompt asked for.
        return week_payload(asked_weeks(prompt))


class DeadProvider(LLMProvider):
    def health(self) -> bool:
        return False

    def generate(self, prompt, schema=None, temperature=0.1):
        raise LLMUnavailableError("gone")


def weeks(n: int) -> list[tuple[int, str]]:
    return [(i, f"Topic {i}") for i in range(1, n + 1)]


# ── Pass 1: essentials ──────────────────────────────────────────────────────


def test_essentials_extracts_outcomes_and_staff():
    got = extract_essentials(FakeProvider(), SYLLABUS)
    assert got.aim.startswith("Use a cloud platform")
    assert got.assumed_knowledge == "PHP, database concepts, SQL."
    assert got.credit_points == "12.5 CP"
    assert [o.code for o in got.outcomes] == ["ULO1", "ULO2"]
    assert got.staff[0].consultation == "Mon 14:00-15:00"


def test_essentials_degrades_to_empty_on_junk():
    # Never schema-valid: an outcome with no text.
    bad = FakeProvider({"outcomes": [{"code": "ULO1"}], "staff": []})
    assert extract_essentials(bad, SYLLABUS) == UnitEssentialsExtraction()


def test_essentials_degrades_to_empty_when_provider_dies():
    assert extract_essentials(DeadProvider(), SYLLABUS) == UnitEssentialsExtraction()


# ── Pass 2: mark map ────────────────────────────────────────────────────────


def test_mark_map_keeps_weighting_kind_and_outcomes():
    rows = extract_mark_map(FakeProvider(), SYLLABUS)
    assert [r.name for r in rows] == ["Labs", "Assignment 3"]
    assert rows[0].due_text == "Weeks 2-11"
    assert rows[1].kind == "Group of 3-4"
    assert rows[1].outcomes == "ULO2, ULO3, ULO4"


def test_mark_map_degrades_to_empty_on_junk():
    bad = FakeProvider({"assessments": [{"name": "A1", "weight_percent": 500}]})
    assert extract_mark_map(bad, SYLLABUS) == []


# ── Pass 3: per-week detail ─────────────────────────────────────────────────


def test_week_details_are_batched_and_ordered():
    provider = FakeProvider()
    details = extract_week_details(provider, SYLLABUS, weeks(9))
    assert [d.week_number for d in details] == list(range(1, 10))
    assert details[2].assessment_note == "Quiz 1"
    assert details[0].focus == ["Be able to explain topic 1"]
    # 9 weeks at 4 per batch → 3 calls, not one giant one.
    assert len(provider.prompts) == 3


def test_week_details_ignore_weeks_that_were_not_asked_for():
    # The model answers with a week outside the batch — it must be dropped, or a
    # hallucinated "Week 40" would overwrite a real week on commit.
    stray = FakeProvider(week_payload([1, 40]))
    details = extract_week_details(stray, SYLLABUS, weeks(1))
    assert [d.week_number for d in details] == [1]


def test_one_failed_batch_does_not_lose_the_others():
    class FlakyProvider(FakeProvider):
        def generate(self, prompt, schema=None, temperature=0.1):
            asked = asked_weeks(prompt)
            if 1 in asked:  # first batch never validates
                raise LLMSchemaError("bad json")
            return week_payload(asked)

    details = extract_week_details(FlakyProvider(), SYLLABUS, weeks(WEEKS_PER_BATCH * 2))
    assert [d.week_number for d in details] == list(
        range(WEEKS_PER_BATCH + 1, WEEKS_PER_BATCH * 2 + 1)
    )


def test_week_detail_prompt_names_only_its_own_batch():
    provider = FakeProvider()
    extract_week_details(provider, SYLLABUS, weeks(WEEKS_PER_BATCH + 1))
    assert asked_weeks(provider.prompts[0]) == list(range(1, WEEKS_PER_BATCH + 1))
    assert asked_weeks(provider.prompts[1]) == [WEEKS_PER_BATCH + 1]


# ── Whole pass ──────────────────────────────────────────────────────────────


def test_extract_unit_plan_runs_every_pass():
    plan = extract_unit_plan(FakeProvider(), SYLLABUS, weeks(2))
    assert plan.essentials.credit_points == "12.5 CP"
    assert len(plan.assessments) == 2
    assert [d.week_number for d in plan.week_details] == [1, 2]


def test_extract_unit_plan_drops_all_empty_weeks():
    """A week the model had nothing to say about is noise in the review gate —
    and committing it would blank detail the user had already entered."""
    blank = FakeProvider(
        {
            "weeks": [
                {"week_number": 1, "lecture": "", "lab": "", "assessment_note": ""},
                {"week_number": 2, "lecture": "Compute", "lab": "", "assessment_note": ""},
            ],
            # The same payload answers the other two passes; both degrade away.
        }
    )
    plan = extract_unit_plan(blank, SYLLABUS, weeks(2))
    assert [d.week_number for d in plan.week_details] == [2]


def test_extract_unit_plan_survives_a_dead_model():
    plan = extract_unit_plan(DeadProvider(), SYLLABUS, weeks(3))
    assert plan.essentials == UnitEssentialsExtraction()
    assert plan.assessments == []
    assert plan.week_details == []


def test_prompts_forbid_inventing_content():
    """The anti-invention rule is the whole defence against a small model
    filling in the canonical syllabus for a topic it recognises."""
    provider = FakeProvider()
    extract_unit_plan(provider, SYLLABUS, weeks(1))
    assert provider.prompts, "no prompt was issued"
    for prompt in provider.prompts:
        assert "Use ONLY what the syllabus below states" in prompt
        assert "--- END SYLLABUS ---" in prompt
