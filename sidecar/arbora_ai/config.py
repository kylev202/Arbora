"""Sidecar configuration: RAM presets, model defaults, host binding.

The concrete LLM model is chosen per request via the IPC `llm_config` (see
resources/Phase1_IPC_Contract.md §5.3); these are only the local defaults the
sidecar falls back to. See resources/Phase0_Model_Presets.md for the rationale.
"""

from __future__ import annotations

# Loopback only — the sidecar must never be reachable off the machine.
HOST = "127.0.0.1"

# RAM presets → default local Ollama model (🌱 low / 🌿 medium / 🌳 high).
PRESET_MODELS: dict[str, str] = {
    "low": "qwen3:4b",
    "medium": "qwen3:8b",
    "high": "qwen3:14b",
}
DEFAULT_PRESET = "medium"

# Local embedding model (Ollama) used for RAG indexing/retrieval.
EMBED_MODEL = "nomic-embed-text"

# Default local Ollama endpoint.
OLLAMA_ENDPOINT = "http://127.0.0.1:11434"


def default_model(preset: str = DEFAULT_PRESET) -> str:
    """Return the default Ollama model for a RAM preset."""
    return PRESET_MODELS.get(preset, PRESET_MODELS[DEFAULT_PRESET])
