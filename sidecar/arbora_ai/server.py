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
from .config import HOST, default_model
from .export import export_apkg
from .generate.job import run_generate
from .ingest.job import run_ingest
from .jobs import JobRegistry
from .llm.provider import LLMSchemaError, LLMUnavailableError, get_provider
from .outline import extract_outline, syllabus_to_text
from .schemas.output import CardOut, OutlineExtraction
from .srs import compute_next

# Marker line Rust scans stdout for to learn the chosen port.
PORT_MARKER = "ARBORA_SIDECAR_PORT="

registry = JobRegistry()


def _data_dir() -> str:
    """App data root (FAISS indexes live under it). Rust pins this at spawn."""
    return os.environ.get("ARBORA_DATA_DIR", ".")


def require_token(x_arbora_token: str | None = Header(default=None)) -> None:
    """Reject requests without the per-launch token (when one is configured)."""
    token = os.environ.get("ARBORA_SIDECAR_TOKEN")
    if token and x_arbora_token != token:
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


class IngestResult(BaseModel):
    chunks: list[ChunkOut]
    chunk_count: int
    page_count: int | None = None


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


class GenerateStatus(BaseModel):
    job_id: str
    state: str
    progress: float
    items_generated: int | None = None
    error: str | None = None


class ParseOutlineRequest(BaseModel):
    subject_id: str
    file_path: str
    llm_config: dict = {}
    preset: str = "medium"  # resolves the local model when llm_config has none


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


class ExportRequest(BaseModel):
    cards: list[CardOut]
    deck_name: str
    out_path: str


class ExportResponse(BaseModel):
    path: str
    card_count: int


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
            job, lambda j: run_generate(j, chunks=chunks, types=req.types, llm_config=cfg)
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

    # ── Syllabus outline extraction ────────────────────────────────────────

    @app.post("/parse-outline", response_model=OutlineExtraction, dependencies=guarded)
    def parse_outline(req: ParseOutlineRequest) -> OutlineExtraction:
        # Synchronous (one LLM call, unlike the per-chunk /generate job). Returns
        # the structured-but-uncommitted result; the core writes nothing until
        # the user confirms it (review-before-trust). The user's own file never
        # leaves the device on the default local provider.
        cfg = dict(req.llm_config)
        cfg.setdefault("provider", "ollama")
        if cfg["provider"] == "ollama":
            cfg.setdefault("model", default_model(req.preset))
        try:
            text = syllabus_to_text(req.file_path)
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        try:
            return extract_outline(get_provider(cfg), text)
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

    # ── Export ─────────────────────────────────────────────────────────────

    @app.post("/export", response_model=ExportResponse, dependencies=guarded)
    def export(req: ExportRequest) -> ExportResponse:
        # Law #2: the core only sends reviewed cards here; each carries its
        # citation, which export_apkg renders into a visible Source line.
        path = export_apkg(req.cards, req.deck_name, req.out_path)
        return ExportResponse(path=str(path), card_count=len(req.cards))

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
