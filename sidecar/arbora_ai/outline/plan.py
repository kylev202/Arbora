"""The deep unit plan: everything a real unit outline carries beyond weeks and
deadlines — the aim and learning outcomes, the teaching team, the assessment
mark map, and per-week detail.

Split into three passes rather than one giant call, because the low preset is a
4B model: one call asked to emit a whole semester's plan either overflows its
context or collapses into a few generic rows. Each pass gets a small schema and
its own slice of the syllabus; week detail is further batched a few weeks at a
time. **Every pass degrades to empty on failure** — a syllabus that yields the
mark map but not the weekly detail still gives the user something useful, and
the caller already holds the fast outline either way.

The whole result is uncommitted: the core stages it as a draft and writes
nothing until the user accepts it in the review gate (ADR-0006, law #2).
"""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel, ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError, LLMUnavailableError
from ..schemas.output import (
    MarkMapExtraction,
    MarkMapRow,
    UnitEssentialsExtraction,
    UnitPlanResult,
    WeekDetailBatch,
    WeekDetailExtraction,
)
from .extract import MAX_STRUCTURE_RETRIES, _fit_to_budget

# Per-pass text budgets. Essentials and the mark map read the front matter and
# the assessment table; week detail reads the weekly-activities table, which is
# the densest part of a unit guide — it gets the most room.
MAX_ESSENTIALS_CHARS = 8000
MAX_MARK_MAP_CHARS = 8000
MAX_WEEK_DETAIL_CHARS = 9000

# Weeks per week-detail call. Four keeps each response short enough that a 4B
# model stays specific instead of degenerating into repeated boilerplate, while
# keeping a 12-week semester to three calls.
WEEKS_PER_BATCH = 4

# Hard ceiling on week-detail calls so a syllabus that parsed into an absurd
# number of "weeks" can't turn one import into a hundred LLM calls.
MAX_WEEK_BATCHES = 8

# Shared preamble. The same anti-invention rule the outline pass uses, said in
# the terms this pass keeps getting wrong: a small model asked about a topic it
# recognises will happily fill in the canonical syllabus for that topic.
_GROUND_RULE = (
    "Use ONLY what the syllabus below states. Never add a fact, name, date, "
    "tool, or topic that is not written in it — not even one you are confident "
    "is true of this kind of unit. If the syllabus does not state something, "
    "leave that field as an empty string and leave that array empty.\n\n"
)


def _syllabus_block(text: str, budget: int) -> str:
    return (
        "--- SYLLABUS ---\n"
        f"{_fit_to_budget(text, budget)}\n"
        "--- END SYLLABUS ---"
    )


M = TypeVar("M", bound=BaseModel)


def _try_extract(provider: LLMProvider, prompt: str, model: type[M], default: M) -> M:
    """Constrained-generate + validate with bounded retries, degrading to
    `default` instead of raising. Every deep-plan pass is optional by design;
    the caller must still get the passes that did work."""
    schema = model.model_json_schema()
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            return model.model_validate(raw)
        except (LLMSchemaError, ValidationError, LLMUnavailableError):
            continue
    return default


# ── Pass 1: unit at a glance ────────────────────────────────────────────────


def essentials_prompt(text: str) -> str:
    return (
        "You are extracting the summary information from a university unit "
        "syllabus (unit outline / course guide).\n\n"
        f"{_GROUND_RULE}"
        "Return JSON with:\n"
        "- aim: the unit's stated aim or purpose, in the syllabus's own terms "
        "(1-4 sentences).\n"
        "- assumed_knowledge: prior knowledge, prerequisite units, or skills "
        "the syllabus says students are assumed to have.\n"
        "- platform: the software, hardware, lab environment, or online "
        "platform the unit runs on, if one is named.\n"
        "- credit_points: the credit-point or unit-value figure, exactly as "
        "written (e.g. '12.5 CP', '6 units').\n"
        "- outcomes: the unit/course learning outcomes, each {code (its label "
        "as written, e.g. 'ULO1' or 'CLO2', else empty), text (the outcome "
        "statement)}. Keep them in the syllabus's order.\n"
        "- staff: everyone listed as teaching or running the unit, each {name, "
        "role (e.g. 'Unit Coordinator', 'Lecturer', 'Tutor'), contact (email "
        "or office as written), consultation (their stated consultation time, "
        "e.g. 'Mon 14:00-15:00', or what the syllabus says instead)}.\n\n"
        f"{_syllabus_block(text, MAX_ESSENTIALS_CHARS)}"
    )


def extract_essentials(provider: LLMProvider, text: str) -> UnitEssentialsExtraction:
    return _try_extract(
        provider,
        essentials_prompt(text),
        UnitEssentialsExtraction,
        UnitEssentialsExtraction(),
    )


# ── Pass 2: the mark map ────────────────────────────────────────────────────


def mark_map_prompt(text: str) -> str:
    return (
        "You are extracting the assessment table from a university unit "
        "syllabus.\n\n"
        f"{_GROUND_RULE}"
        "Return JSON with one array, assessments, holding EVERY assessed task "
        "the syllabus lists — including small recurring ones such as weekly "
        "labs, tutorial participation, or quizzes, not just the major "
        "assignments. Each {\n"
        "- name: the task's name as written (e.g. 'Assignment 1b', "
        "'Lecture quizzes').\n"
        "- weight_percent: its weighting as a number 0-100. Use 0 if the "
        "syllabus states no weighting.\n"
        "- due_text: when it is due, exactly as written (e.g. 'Week 6', "
        "'Weeks 2-11', '20 Oct 23:59').\n"
        "- kind: whether it is individual or group work, as written (e.g. "
        "'Individual', 'Group of 3-4'). Empty if not stated.\n"
        "- outcomes: the learning-outcome labels it maps to, as written (e.g. "
        "'ULO1, ULO3'). Empty if the syllabus does not map it.\n"
        "}\n"
        "Keep the syllabus's own order. Do not merge two tasks into one row, "
        "and do not split one task into several.\n\n"
        f"{_syllabus_block(text, MAX_MARK_MAP_CHARS)}"
    )


def extract_mark_map(provider: LLMProvider, text: str) -> list[MarkMapRow]:
    return _try_extract(
        provider, mark_map_prompt(text), MarkMapExtraction, MarkMapExtraction()
    ).assessments


# ── Pass 3: per-week detail ─────────────────────────────────────────────────


def week_detail_prompt(text: str, weeks: list[tuple[int, str]]) -> str:
    """`weeks` is the (number, topic) pairs already extracted by the fast pass —
    naming them anchors the model to the right rows of the weekly table instead
    of letting it re-derive the schedule."""
    listed = "\n".join(f"- Week {n}: {title or '(topic not stated)'}" for n, title in weeks)
    numbers = ", ".join(str(n) for n, _ in weeks)
    return (
        "You are expanding the weekly schedule of a university unit syllabus "
        f"into study detail, for these weeks only: {numbers}.\n\n"
        f"{_GROUND_RULE}"
        "The weeks and their topics, already confirmed:\n"
        f"{listed}\n\n"
        "Return JSON with one array, weeks, holding exactly one entry per week "
        f"listed above ({numbers}). Each {{\n"
        "- week_number: the week's number.\n"
        "- lecture: the lecture/class topics the syllabus gives for that week.\n"
        "- lab: the lab, tutorial, workshop, or practical for that week, with "
        "its name or number if the syllabus gives one.\n"
        "- assessment_note: anything the syllabus says is due, held, or "
        "assessed in that week (e.g. 'Quiz 2', 'Assignment 1a due'). Empty if "
        "nothing is.\n"
        "- focus: 2-4 short study targets for the week. Each must restate "
        "something from THAT week's own topics above as a thing to be able to "
        "do or tell apart (e.g. 'Be able to explain X and when not to use it', "
        "'Tell X and Y apart'). Use only terms that appear in this syllabus.\n"
        "- deliverables: 1-3 concrete things to have finished by the end of "
        "that week, each drawn from what the week itself involves (its lab, "
        "its reading, its assessment, its topics). Use only terms that appear "
        "in this syllabus.\n"
        "}\n"
        "Do not invent a topic, tool, or task for a week the syllabus leaves "
        "blank — return empty strings and empty arrays for that week instead.\n\n"
        f"{_syllabus_block(text, MAX_WEEK_DETAIL_CHARS)}"
    )


def extract_week_details(
    provider: LLMProvider, text: str, weeks: list[tuple[int, str]]
) -> list[WeekDetailExtraction]:
    """Expand `weeks` in batches. Batches are independent: one that fails is
    skipped, the rest still land. Only weeks that were asked for are kept, and
    the first entry wins if the model repeats a week number."""
    wanted = {n for n, _ in weeks}
    out: dict[int, WeekDetailExtraction] = {}
    batches = [
        weeks[i : i + WEEKS_PER_BATCH] for i in range(0, len(weeks), WEEKS_PER_BATCH)
    ][:MAX_WEEK_BATCHES]
    for batch in batches:
        result = _try_extract(
            provider,
            week_detail_prompt(text, batch),
            WeekDetailBatch,
            WeekDetailBatch(),
        )
        for detail in result.weeks:
            if detail.week_number in wanted and detail.week_number not in out:
                out[detail.week_number] = detail
    return [out[n] for n in sorted(out)]


# ── The whole pass ──────────────────────────────────────────────────────────


def _is_useful(detail: WeekDetailExtraction) -> bool:
    """Drop a week the model had nothing to say about — an all-empty row is
    noise in the review gate and would blank a week the user already filled in."""
    return bool(
        detail.lecture.strip()
        or detail.lab.strip()
        or detail.assessment_note.strip()
        or detail.focus
        or detail.deliverables
    )


def extract_unit_plan(
    provider: LLMProvider, text: str, weeks: list[tuple[int, str]]
) -> UnitPlanResult:
    """Run all three passes. Never raises for content reasons: the caller stages
    whatever came back for the user to review."""
    return UnitPlanResult(
        essentials=extract_essentials(provider, text),
        assessments=extract_mark_map(provider, text),
        week_details=[d for d in extract_week_details(provider, text, weeks) if _is_useful(d)],
    )
