import os

import pytest

from arbora_ai.llm.provider import OllamaProvider

# Needs a running Ollama with the default preset model pulled.
pytestmark = pytest.mark.skipif(
    not os.environ.get("ARBORA_RUN_INTEGRATION"),
    reason="set ARBORA_RUN_INTEGRATION=1 to run (needs Ollama + model)",
)


def test_ollama_health():
    assert OllamaProvider().health() is True


def test_ollama_generate_json():
    provider = OllamaProvider()
    out = provider.generate('Reply with this exact JSON object: {"pong": true}')
    assert isinstance(out, dict)
