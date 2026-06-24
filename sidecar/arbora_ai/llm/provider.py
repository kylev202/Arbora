"""LLM provider interface + implementations.

`generate/` and `rag/` may only depend on `LLMProvider` (the interface). The
factory `get_provider` is the one place that knows the concrete backend.
See resources/Phase1_IPC_Contract.md §7.

Schema-constrained validate-then-retry lands in Phase 3; this skeleton proves
connectivity and the JSON-mode call path.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod

import ollama

from ..config import OLLAMA_ENDPOINT, default_model


class LLMError(Exception):
    """Base class for provider errors."""


class LLMUnavailableError(LLMError):
    """The model/endpoint could not be reached."""


class LLMSchemaError(LLMError):
    """The model output could not be parsed/validated as required."""


class LLMProvider(ABC):
    """The only abstraction generate/* and rag/* are allowed to call."""

    @abstractmethod
    def health(self) -> bool:
        """True if the model is ready to accept requests."""

    @abstractmethod
    def generate(self, prompt: str, schema: dict | None = None, temperature: float = 0.1) -> dict:
        """Call the LLM in JSON mode and return a parsed dict.

        Raises LLMUnavailableError on connection failure, LLMSchemaError if the
        response is not valid JSON.
        """


class OllamaProvider(LLMProvider):
    """Local Ollama backend."""

    def __init__(self, model: str | None = None, endpoint: str = OLLAMA_ENDPOINT):
        self.model = model or default_model()
        self._client = ollama.Client(host=endpoint)

    def health(self) -> bool:
        try:
            self._client.list()
            return True
        except Exception:
            return False

    def generate(self, prompt: str, schema: dict | None = None, temperature: float = 0.1) -> dict:
        try:
            resp = self._client.generate(
                model=self.model,
                prompt=prompt,
                format="json",
                options={"temperature": temperature},
            )
        except Exception as exc:  # connection / model errors
            raise LLMUnavailableError(str(exc)) from exc

        text = resp["response"] if isinstance(resp, dict) else resp.response
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise LLMSchemaError(f"model did not return valid JSON: {exc}") from exc


# ONLINE — data leaves device. Only instantiate when the user enables byo_key.
class OpenAICompatProvider(LLMProvider):
    """OpenAI-compatible remote endpoint (OpenAI/Gemini/Anthropic/OpenRouter/custom).

    Skeleton only — wired up alongside BYO-key support in a later phase.
    """

    def __init__(self, model: str, endpoint: str, api_key: str):
        self.model = model
        self.endpoint = endpoint
        self._api_key = api_key

    def health(self) -> bool:
        raise NotImplementedError("OpenAICompatProvider lands with BYO-key support")

    def generate(self, prompt: str, schema: dict | None = None, temperature: float = 0.1) -> dict:
        raise NotImplementedError("OpenAICompatProvider lands with BYO-key support")


def get_provider(config: dict) -> LLMProvider:
    """Build a provider from an IPC `llm_config` dict (see IPC Contract §5.3)."""
    provider = config.get("provider", "ollama")
    if provider == "ollama":
        return OllamaProvider(
            model=config.get("model"),
            endpoint=config.get("endpoint", OLLAMA_ENDPOINT),
        )
    if provider == "openai_compat":
        return OpenAICompatProvider(
            model=config["model"],
            endpoint=config["endpoint"],
            api_key=config["api_key"],
        )
    raise ValueError(f"unknown provider: {provider!r}")
