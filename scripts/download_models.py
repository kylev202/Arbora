#!/usr/bin/env python3
"""Download the local models Arbora needs for the default (🌿 medium) preset.

Pulls the Ollama LLM + embedding models and warms the Whisper base model.
Run once after installing Ollama:  python scripts/download_models.py
"""

from __future__ import annotations

import subprocess
import sys

OLLAMA_MODELS = ["qwen3:8b", "nomic-embed-text"]
WHISPER_SIZE = "base"


def pull_ollama(model: str) -> None:
    print(f"→ ollama pull {model}")
    subprocess.run(["ollama", "pull", model], check=True)


def warm_whisper(size: str) -> None:
    print(f"→ caching whisper '{size}' model")
    from faster_whisper import WhisperModel

    WhisperModel(size, device="cpu", compute_type="int8")


def main() -> int:
    try:
        for model in OLLAMA_MODELS:
            pull_ollama(model)
        warm_whisper(WHISPER_SIZE)
    except FileNotFoundError:
        print("error: `ollama` not found on PATH — install it from https://ollama.com", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as exc:
        print(f"error: model download failed ({exc})", file=sys.stderr)
        return 1
    print("✓ models ready")
    return 0


if __name__ == "__main__":
    sys.exit(main())
