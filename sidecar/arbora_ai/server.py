"""Arbora AI sidecar — FastAPI loopback server.

Lifecycle contract with the Rust core:
  1. Rust spawns `python -m arbora_ai.server`.
  2. The sidecar picks a free loopback port and prints `ARBORA_SIDECAR_PORT=<port>`
     to stdout (the one line Rust parses); all other logs go to stderr.
  3. Rust polls `GET /health` until it returns 200.

Security: every endpoint except `/health` requires the per-launch shared token Rust
passes in `ARBORA_SIDECAR_TOKEN` (header `X-Arbora-Token`), so other local processes
on the loopback port can't drive the sidecar. See the tauri-sidecar skill.

See resources/Phase1_IPC_Contract.md §5 for the full API.
"""

from __future__ import annotations

import os
import socket
import sys

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from typing import Literal
from pydantic import BaseModel

from . import __version__
from .assess import grade_answer, run_test_generate
from .chat.session import answer_question
from .diagram.session import generate_diagram
from .config import HOST, default_model
from .generate.job import run_assignment_brief, run_generate, run_walkthrough
from .ingest.job import run_ingest
from .jobs import JobRegistry
from .llm.models import model_ready, pull_model, warmup_model
from .llm.provider import LLMSchemaError, LLMUnavailableError, get_provider
from .pet import answer_app_help, route_question
from .planner import (
    AvoidSlotIn,
    BusyIn,
    DeadlineIn,
    ExistingSessionIn,
    LectureIn,
    MissedIn,
    PlanOut,
    SessionOut,
    SubjectIn,
    WindowIn,
    plan_week,
    resuggest_session,
)
from .assignment import extract_rubric, extract_spec
from .outline import extract_outline, extract_unit_info, syllabus_to_text
from .schemas.output import OutlineParseResult, RubricExtraction, SourceRef, SpecExtraction
from .srs import compute_next

# Marker line Rust scans stdout for to learn the chosen port.
PORT_MARKER = "ARBORA_SIDECAR_PORT="

registry = JobRegistry()


def _data_dir() -> str:
    """App data root (FAISS indexes live under it). Rust pins this at spawn."""
    return os.environ.get("ARBORA_DATA_DIR", ".")


def require_token(x_arbora_token: str | None = Header(default=None)) -> None:
    """Reject requests unless they carry the per-launch token.

    Fails closed: no configured token means every guarded request is refused —
    a missing ARBORA_SIDECAR_TOKEN is a deployment bug, not an open door.
    (Running the server by hand for debugging requires exporting the var.)
    """
    token = os.environ.get("ARBORA_SIDECAR_TOKEN")
    if not token:
        raise HTTPException(status_code=503, detail="sidecar token not configured")
    if x_arbora_token != token:
        raise HTTPException(status_code=401, detail="invalid sidecar token")


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = __version__
    model_loaded: bool = False
    whisper_loaded: bool = False


class IngestRequest(BaseModel):
    source_id: str
    subject_id: str
    file_path: str
    type: str  # "pdf" | "slide" | "audio"
    job_id: str | None = None


class IngestStatus(BaseModel):
    job_id: str
    state: str
    progress: float
    step: str
    chunk_count: int | None = None
    error: str | None = None


class ChunkOut(BaseModel):
    text: str
    page: int | None = None
    timestamp_ms: int | None = None
    faiss_id: int
    chunk_index: int


class FigureOut(BaseModel):
    page: int
    path: str
    width: int
    height: int


class IngestResult(BaseModel):
    chunks: list[ChunkOut]
    chunk_count: int
    page_count: int | None = None
    figures: list[FigureOut] = []


class GenChunk(BaseModel):
    source_id: str
    text: str
    page: int | None = None
    timestamp_ms: int | None = None
    chunk_index: int


class GenerateRequest(BaseModel):
    subject_id: str
    types: list[str]
    chunks: list[GenChunk]
    llm_config: dict = {}
    preset: str = "medium"  # resolves the local model when llm_config has none
    job_id: str | None = None
    discipline: str = "general"  # steers subject-aware formatting (math → LaTeX, cs → code)


class GenerateStatus(BaseModel):
    job_id: str
    state: str
    progress: float
    items_generated: int | None = None
    error: str | None = None


class AssignmentBriefRequest(BaseModel):
    subject_id: str
    deadline_id: str
    assignment_title: str
    chunks: list[GenChunk]
    rubric: str = ""  # compact rubric digest; steers the prompt, never cited
    llm_config: dict = {}
    preset: str = "medium"
    job_id: str | None = None


class WalkthroughRequest(BaseModel):
    subject_id: str
    week_id: str
    week_title: str = ""
    chunks: list[GenChunk]
    llm_config: dict = {}
    preset: str = "medium"
    job_id: str | None = None
    discipline: str = "general"  # steers subject-aware formatting (math → LaTeX, cs → code)
    figures: list[dict] = []  # source figures available to lessons (ADR-0012)


class ModelReadyResponse(BaseModel):
    model: str
    ready: bool
    ollama_running: bool


class ModelPullRequest(BaseModel):
    preset: str = "medium"
    job_id: str | None = None


class ModelPullStatus(BaseModel):
    job_id: str
    state: str
    progress: float
    step: str
    error: str | None = None


class ModelWarmupRequest(BaseModel):
    preset: str = "medium"


class ChatTurn(BaseModel):
    """One prior conversation turn (chat panel or pet) — ephemeral, never stored."""

    role: Literal["user", "assistant"]
    content: str


class PetRouteRequest(BaseModel):
    question: str
    preset: str = "medium"
    history: list[ChatTurn] = []


class PetRouteResponse(BaseModel):
    domain: str  # "lesson" | "app_help" | "out_of_scope"


class PetHelpRequest(BaseModel):
    question: str
    preset: str = "medium"


class PetHelpRef(BaseModel):
    section: int
    title: str
    excerpt: str


class PetHelpResponse(BaseModel):
    answer: str
    refs: list[PetHelpRef]


class SchedulePlanRequest(BaseModel):
    week_start: str  # ISO date (Monday)
    windows: list[WindowIn] = []
    subjects: list[SubjectIn] = []
    deadlines: list[DeadlineIn] = []
    lectures: list[LectureIn] = []
    busy: list[BusyIn] = []
    missed: list[MissedIn] = []
    existing: list[ExistingSessionIn] = []
    goal: str | None = None
    session_minutes: int = 50
    preferred_hour: int | None = None
    avoid_slots: list[AvoidSlotIn] = []


class ResuggestRequest(BaseModel):
    week_start: str  # ISO date (Monday)
    windows: list[WindowIn] = []
    busy: list[BusyIn] = []  # calendar events + the other pending proposals
    subject_id: str | None = None
    title: str
    declined_start_at: str  # the slot the user can't make — never handed back
    session_minutes: int = 50
    preferred_hour: int | None = None
    avoid_slots: list[AvoidSlotIn] = []


class ParseOutlineRequest(BaseModel):
    subject_id: str
    file_path: str
    llm_config: dict = {}
    preset: str = "medium"  # resolves the local model when llm_config has none


class ParseAssignmentRequest(BaseModel):
    subject_id: str
    file_path: str
    assignment_title: str = ""  # steers the spec extraction; unused for rubrics
    llm_config: dict = {}
    preset: str = "medium"


class ScheduleRequest(BaseModel):
    state: str
    stability: float
    difficulty: float
    step: int | None = None
    last_review: str | None = None
    due: str | None = None
    rating: Literal["again", "hard", "good", "easy"]


class ScheduleResponse(BaseModel):
    due: str
    stability: float
    difficulty: float
    state: str
    step: int | None
    last_review: str


class TestGenerateRequest(BaseModel):
    subject_id: str
    types: list[str]
    chunks: list[GenChunk]
    count_per_type: int = 2
    llm_config: dict = {}
    preset: str = "medium"
    job_id: str | None = None


class TestGradeRequest(BaseModel):
    question: str
    expected: str
    user_answer: str
    preset: str = "medium"


class TestGradeResponse(BaseModel):
    verdict: str  # "correct" | "partial" | "incorrect"
    feedback: str


class ChatChunk(BaseModel):
    faiss_id: int
    source_id: str
    text: str
    page: int | None = None
    timestamp_ms: int | None = None


class ChatRequest(BaseModel):
    subject_id: str
    question: str
    chunks: list[ChatChunk]
    preset: str = "medium"
    k: int = 6
    history: list[ChatTurn] = []


class ChatResponse(BaseModel):
    answer: str
    source_refs: list[SourceRef]
    suggested_questions: list[str] = []


class DiagramChunk(BaseModel):
    faiss_id: int
    source_id: str
    text: str
    page: int | None = None
    timestamp_ms: int | None = None


class DiagramRequest(BaseModel):
    subject_id: str
    topic: str
    chunks: list[DiagramChunk]
    preset: str = "medium"
    k: int = 8


class DiagramResponse(BaseModel):
    title: str
    mermaid_code: str
    source_refs: list[SourceRef]


def create_app() -> FastAPI:
    app = FastAPI(title="Arbora AI sidecar", version=__version__)
    guarded = [Depends(require_token)]

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        # Models load lazily on first use; the server being reachable is what
        # liveness means at this stage.
        return HealthResponse()

    @app.post("/ingest", status_code=202, dependencies=guarded)
    def ingest(req: IngestRequest) -> dict[str, str]:
        job = registry.create(req.job_id)
        data_dir = _data_dir()
        registry.submit(
            job,
            lambda j: run_ingest(
                j,
                source_id=req.source_id,
                subject_id=req.subject_id,
                file_path=req.file_path,
                source_type=req.type,
                data_dir=data_dir,
            ),
        )
        return {"job_id": job.id}

    @app.get("/ingest/{job_id}/status", response_model=IngestStatus, dependencies=guarded)
    def ingest_status(job_id: str) -> IngestStatus:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        return IngestStatus(
            job_id=job.id,
            state=job.state,
            progress=job.progress,
            step=job.step,
            chunk_count=job.meta.get("chunk_count"),
            error=job.error,
        )

    @app.get("/ingest/{job_id}/result", response_model=IngestResult, dependencies=guarded)
    def ingest_result(job_id: str) -> IngestResult:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        if job.state != "done":
            raise HTTPException(status_code=409, detail=f"job not done (state={job.state})")
        return IngestResult(
            chunks=job.result,
            chunk_count=job.meta.get("chunk_count", len(job.result)),
            page_count=job.meta.get("page_count"),
            figures=job.meta.get("figures", []),
        )

    @app.post("/generate", status_code=202, dependencies=guarded)
    def generate(req: GenerateRequest) -> dict[str, str]:
        cfg = dict(req.llm_config)
        cfg.setdefault("provider", "ollama")
        if cfg["provider"] == "ollama":
            cfg.setdefault("model", default_model(req.preset))
        chunks = [c.model_dump() for c in req.chunks]
        job = registry.create(req.job_id)
        registry.submit(
            job,
            lambda j: run_generate(
                j, chunks=chunks, types=req.types, llm_config=cfg, discipline=req.discipline
            ),
        )
        return {"job_id": job.id}

    @app.get("/generate/{job_id}/status", response_model=GenerateStatus, dependencies=guarded)
    def generate_status(job_id: str) -> GenerateStatus:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        return GenerateStatus(
            job_id=job.id,
            state=job.state,
            progress=job.progress,
            items_generated=job.meta.get("items_generated"),
            error=job.error,
        )

    @app.get("/generate/{job_id}/result", dependencies=guarded)
    def generate_result(job_id: str) -> dict:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        if job.state != "done":
            raise HTTPException(status_code=409, detail=f"job not done (state={job.state})")
        return job.result  # {notes, cards, quiz_items}

    # ── Assignment study brief (grounded, review-gated) ────────────────────

    @app.post("/assignment-brief", status_code=202, dependencies=guarded)
    def assignment_brief(req: AssignmentBriefRequest) -> dict[str, str]:
        cfg = dict(req.llm_config)
        cfg.setdefault("provider", "ollama")
        if cfg["provider"] == "ollama":
            cfg.setdefault("model", default_model(req.preset))
        chunks = [c.model_dump() for c in req.chunks]
        job = registry.create(req.job_id)
        registry.submit(
            job,
            lambda j: run_assignment_brief(
                j,
                chunks=chunks,
                assignment_title=req.assignment_title,
                llm_config=cfg,
                rubric=req.rubric,
            ),
        )
        return {"job_id": job.id}

    @app.get(
        "/assignment-brief/{job_id}/status", response_model=GenerateStatus, dependencies=guarded
    )
    def assignment_brief_status(job_id: str) -> GenerateStatus:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        return GenerateStatus(
            job_id=job.id,
            state=job.state,
            progress=job.progress,
            items_generated=job.meta.get("items_generated"),
            error=job.error,
        )

    @app.get("/assignment-brief/{job_id}/result", dependencies=guarded)
    def assignment_brief_result(job_id: str) -> dict:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        if job.state != "done":
            raise HTTPException(status_code=409, detail=f"job not done (state={job.state})")
        return job.result  # {content, source_refs}

    # ── Week walkthrough (guided week session, review-gated) ───────────────

    @app.post("/walkthrough", status_code=202, dependencies=guarded)
    def walkthrough(req: WalkthroughRequest) -> dict[str, str]:
        cfg = dict(req.llm_config)
        cfg.setdefault("provider", "ollama")
        if cfg["provider"] == "ollama":
            cfg.setdefault("model", default_model(req.preset))
        chunks = [c.model_dump() for c in req.chunks]
        job = registry.create(req.job_id)
        registry.submit(
            job,
            lambda j: run_walkthrough(
                j,
                chunks=chunks,
                week_title=req.week_title,
                llm_config=cfg,
                discipline=req.discipline,
                figures=req.figures,
                preset=req.preset,
            ),
        )
        return {"job_id": job.id}

    @app.get("/walkthrough/{job_id}/status", response_model=GenerateStatus, dependencies=guarded)
    def walkthrough_status(job_id: str) -> GenerateStatus:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        return GenerateStatus(
            job_id=job.id,
            state=job.state,
            progress=job.progress,
            items_generated=job.meta.get("items_generated"),
            error=job.error,
        )

    @app.get("/walkthrough/{job_id}/result", dependencies=guarded)
    def walkthrough_result(job_id: str) -> dict:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        if job.state != "done":
            raise HTTPException(status_code=409, detail=f"job not done (state={job.state})")
        return job.result  # {overview, overview_refs, lessons}

    # ── Ollama model management (onboarding preset download) ───────────────

    @app.get("/model/{preset}/ready", response_model=ModelReadyResponse, dependencies=guarded)
    def model_ready_check(preset: str) -> ModelReadyResponse:
        return ModelReadyResponse(**model_ready(preset))

    @app.post("/model/pull", status_code=202, dependencies=guarded)
    def model_pull(req: ModelPullRequest) -> dict[str, str]:
        job = registry.create(req.job_id)
        registry.submit(job, lambda j: pull_model(j, req.preset))
        return {"job_id": job.id}

    @app.get("/model/pull/{job_id}/status", response_model=ModelPullStatus, dependencies=guarded)
    def model_pull_status(job_id: str) -> ModelPullStatus:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        return ModelPullStatus(
            job_id=job.id, state=job.state, progress=job.progress, step=job.step, error=job.error
        )

    @app.post("/model/warmup", status_code=202, dependencies=guarded)
    def model_warmup(req: ModelWarmupRequest) -> dict[str, str]:
        # Best-effort background load so the first chat isn't cold; nobody polls.
        job = registry.create()
        registry.submit(job, lambda _j: warmup_model(req.preset))
        return {"job_id": job.id}

    # ── Pet companion ───────────────────────────────────────────────────────

    @app.post("/pet/route", response_model=PetRouteResponse, dependencies=guarded)
    def pet_route(req: PetRouteRequest) -> PetRouteResponse:
        # Classify before answering: the pet only serves its two grounded
        # domains (law #1); everything else is refused by the UI.
        cfg: dict = {"provider": "ollama", "model": default_model(req.preset)}
        try:
            domain = route_question(
                req.question,
                get_provider(cfg),
                history=[t.model_dump() for t in req.history],
            )
        except LLMUnavailableError as exc:
            raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return PetRouteResponse(domain=domain)

    @app.post("/pet/help", response_model=PetHelpResponse, dependencies=guarded)
    def pet_help(req: PetHelpRequest) -> PetHelpResponse:
        # Domain B: grounded in the packaged help KB (law #1 — the pet never
        # invents features; refs cite KB sections).
        cfg: dict = {"provider": "ollama", "model": default_model(req.preset)}
        try:
            answer, refs = answer_app_help(req.question, get_provider(cfg))
        except LLMUnavailableError as exc:
            raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return PetHelpResponse(answer=answer, refs=[PetHelpRef(**r) for r in refs])

    # ── Week planner (rule-based; proposals only — law #2) ─────────────────

    @app.post("/schedule-plan", response_model=PlanOut, dependencies=guarded)
    def schedule_plan(req: SchedulePlanRequest) -> PlanOut:
        from datetime import date

        try:
            week_start = date.fromisoformat(req.week_start)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"bad week_start: {exc}") from exc
        return plan_week(
            week_start=week_start,
            windows=req.windows,
            subjects=req.subjects,
            deadlines=req.deadlines,
            lectures=req.lectures,
            busy=req.busy,
            missed=req.missed,
            existing=req.existing,
            goal=req.goal,
            session_minutes=req.session_minutes,
            preferred_hour=req.preferred_hour,
            avoid_slots=req.avoid_slots,
        )

    @app.post("/resuggest-session", response_model=SessionOut | None, dependencies=guarded)
    def resuggest(req: ResuggestRequest) -> SessionOut | None:
        from datetime import date

        try:
            week_start = date.fromisoformat(req.week_start)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"bad week_start: {exc}") from exc
        return resuggest_session(
            week_start=week_start,
            windows=req.windows,
            busy=req.busy,
            subject_id=req.subject_id,
            title=req.title,
            declined_start_at=req.declined_start_at,
            session_minutes=req.session_minutes,
            preferred_hour=req.preferred_hour,
            avoid_slots=req.avoid_slots,
        )

    # ── Syllabus outline extraction ────────────────────────────────────────

    @app.post("/parse-outline", response_model=OutlineParseResult, dependencies=guarded)
    def parse_outline(req: ParseOutlineRequest) -> OutlineParseResult:
        # Synchronous (two LLM calls — schedule, then unit info — unlike the
        # per-chunk /generate job). Returns the structured-but-uncommitted
        # result; the core writes nothing until the user confirms it
        # (review-before-trust). The user's own file never leaves the device
        # on the default local provider.
        cfg = dict(req.llm_config)
        cfg.setdefault("provider", "ollama")
        if cfg["provider"] == "ollama":
            cfg.setdefault("model", default_model(req.preset))
        try:
            text = syllabus_to_text(req.file_path)
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        try:
            provider = get_provider(cfg)
            outline = extract_outline(provider, text)
            # Degrades to empty on retry exhaustion — never fails the parse.
            unit_info = extract_unit_info(provider, text)
        except LLMUnavailableError as exc:
            raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc
        except LLMSchemaError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return OutlineParseResult(
            weeks=outline.weeks, deadlines=outline.deadlines, unit_info=unit_info
        )

    # ── Assignment spec + rubric extraction ────────────────────────────────
    # Same contract as /parse-outline: synchronous, on-device, returns the
    # structured-but-uncommitted result for the user to review (ADR-0006).

    def _read_and_configure(req: ParseAssignmentRequest) -> tuple[str, dict]:
        cfg = dict(req.llm_config)
        cfg.setdefault("provider", "ollama")
        if cfg["provider"] == "ollama":
            cfg.setdefault("model", default_model(req.preset))
        try:
            text = syllabus_to_text(req.file_path)  # generic doc→text reader
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return text, cfg

    @app.post("/parse-assignment-spec", response_model=SpecExtraction, dependencies=guarded)
    def parse_assignment_spec(req: ParseAssignmentRequest) -> SpecExtraction:
        text, cfg = _read_and_configure(req)
        try:
            return extract_spec(get_provider(cfg), text, req.assignment_title)
        except LLMUnavailableError as exc:
            raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc
        except LLMSchemaError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/parse-rubric", response_model=RubricExtraction, dependencies=guarded)
    def parse_rubric(req: ParseAssignmentRequest) -> RubricExtraction:
        text, cfg = _read_and_configure(req)
        try:
            return extract_rubric(get_provider(cfg), text)
        except LLMUnavailableError as exc:
            raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc
        except LLMSchemaError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # ── FSRS scheduling ────────────────────────────────────────────────────

    @app.post("/schedule", response_model=ScheduleResponse, dependencies=guarded)
    def schedule(req: ScheduleRequest) -> ScheduleResponse:
        result = compute_next(
            state=req.state,
            stability=req.stability,
            difficulty=req.difficulty,
            step=req.step,
            last_review=req.last_review,
            due=req.due,
            rating=req.rating,
        )
        return ScheduleResponse(**result)

    # ── RAG Q&A ────────────────────────────────────────────────────────────

    @app.post("/chat", response_model=ChatResponse, dependencies=guarded)
    def chat(req: ChatRequest) -> ChatResponse:
        # Synchronous: one embedding call + FAISS search + one LLM call.
        # Q&A answers are ephemeral — not persisted, no review gate (law #2).
        cfg: dict = {"provider": "ollama", "model": default_model(req.preset)}
        chunks = [c.model_dump() for c in req.chunks]
        try:
            answer, source_refs, suggested = answer_question(
                question=req.question,
                subject_id=req.subject_id,
                chunks=chunks,
                provider=get_provider(cfg),
                data_dir=_data_dir(),
                k=req.k,
                history=[t.model_dump() for t in req.history],
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except LLMUnavailableError as exc:
            raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc
        except LLMSchemaError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return ChatResponse(answer=answer, source_refs=source_refs, suggested_questions=suggested)

    # ── Mermaid diagrams ───────────────────────────────────────────────────

    @app.post("/diagram", response_model=DiagramResponse, dependencies=guarded)
    def diagram(req: DiagramRequest) -> DiagramResponse:
        # Synchronous: one embedding + FAISS search + one LLM call.
        # Diagrams are visual study aids, not deck items — no review gate (law #2).
        cfg: dict = {"provider": "ollama", "model": default_model(req.preset)}
        chunks = [c.model_dump() for c in req.chunks]
        try:
            title, mermaid_code, source_refs = generate_diagram(
                topic=req.topic,
                subject_id=req.subject_id,
                chunks=chunks,
                provider=get_provider(cfg),
                data_dir=_data_dir(),
                k=req.k,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except LLMUnavailableError as exc:
            raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc
        except LLMSchemaError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return DiagramResponse(title=title, mermaid_code=mermaid_code, source_refs=source_refs)

    # ── Practice tests (ephemeral, cited — chat/diagram precedent) ─────────

    @app.post("/test/generate", status_code=202, dependencies=guarded)
    def test_generate(req: TestGenerateRequest) -> dict[str, str]:
        cfg = dict(req.llm_config)
        cfg.setdefault("provider", "ollama")
        if cfg["provider"] == "ollama":
            cfg.setdefault("model", default_model(req.preset))
        chunks = [c.model_dump() for c in req.chunks]
        job = registry.create(req.job_id)
        registry.submit(
            job,
            lambda j: run_test_generate(
                j,
                chunks=chunks,
                types=req.types,
                count_per_type=req.count_per_type,
                llm_config=cfg,
            ),
        )
        return {"job_id": job.id}

    @app.get("/test/generate/{job_id}/status", response_model=GenerateStatus, dependencies=guarded)
    def test_generate_status(job_id: str) -> GenerateStatus:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        return GenerateStatus(
            job_id=job.id,
            state=job.state,
            progress=job.progress,
            items_generated=job.meta.get("items_generated"),
            error=job.error,
        )

    @app.get("/test/generate/{job_id}/result", dependencies=guarded)
    def test_generate_result(job_id: str) -> dict:
        job = registry.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="unknown job")
        if job.state != "done":
            raise HTTPException(status_code=409, detail=f"job not done (state={job.state})")
        return job.result  # {items: [{kind, ..., source_ref}]}

    @app.post("/test/grade", response_model=TestGradeResponse, dependencies=guarded)
    def test_grade(req: TestGradeRequest) -> TestGradeResponse:
        # Synchronous: one structured LLM call. Feedback is ephemeral and only
        # compares against the item's own grounded expected answer.
        cfg: dict = {"provider": "ollama", "model": default_model(req.preset)}
        try:
            grade = grade_answer(get_provider(cfg), req.question, req.expected, req.user_answer)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except LLMUnavailableError as exc:
            raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc
        return TestGradeResponse(verdict=grade.verdict, feedback=grade.feedback)

    return app


app = create_app()


def _free_port() -> int:
    """Pick an unused loopback TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return sock.getsockname()[1]


def main() -> None:
    # Rust may pin the port via env; otherwise the sidecar picks one.
    port = int(os.environ.get("ARBORA_SIDECAR_PORT") or _free_port())

    # Announce the port on stdout *before* uvicorn blocks. flush so Rust sees it.
    print(f"{PORT_MARKER}{port}", flush=True)

    uvicorn.run(app, host=HOST, port=port, log_level="warning")


if __name__ == "__main__":
    sys.exit(main())
