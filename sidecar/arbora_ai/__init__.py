"""Arbora AI sidecar.

All AI work (ingest, transcribe, RAG, LLM generation, FSRS, export) runs here as a
local FastAPI service that the Rust core spawns and talks to over loopback HTTP.
"""

__version__ = "0.2.0"
