"""Arbora AI sidecar — FastAPI loopback server.

Lifecycle contract with the Rust core:
  1. Rust spawns `python -m arbora_ai.server`.
  2. The sidecar picks a free loopback port and prints `ARBORA_SIDECAR_PORT=<port>`
     to stdout (the one line Rust parses); all other logs go to stderr.
  3. Rust polls `GET /health` until it returns 200.

See resources/Phase1_IPC_Contract.md §5 for the full API.
"""

from __future__ import annotations

import os
import socket
import sys

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from . import __version__
from .config import HOST

# Marker line Rust scans stdout for to learn the chosen port.
PORT_MARKER = "ARBORA_SIDECAR_PORT="


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = __version__
    model_loaded: bool = False
    whisper_loaded: bool = False


def create_app() -> FastAPI:
    app = FastAPI(title="Arbora AI sidecar", version=__version__)

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        # Models load lazily on first use; the server itself being reachable is
        # what liveness means at this stage.
        return HealthResponse()

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
