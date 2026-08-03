"""LLM provider interface + implementations.

`generate/` and `rag/` may only depend on `LLMProvider` (the interface). The
factory `get_provider` is the one place that knows the concrete backend.
See resources/Phase1_IPC_Contract.md §7.

`generate(prompt, schema)` constrains the model to a JSON Schema when one is
given (Ollama structured output); the caller then validates with Pydantic and
retries. This is the only call path generate/* uses.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod

import httpx
import ollama

from ..config import OLLAMA_ENDPOINT, default_model


class LLMError(Exception):
    """Base class for provider errors."""


class LLMUnavailableError(LLMError):
    """The model/endpoint could not be reached."""


class LLMSchemaError(LLMError):
    """The model output could not be parsed/validated as required."""


# Ollama's structured-output grammar builder (through 0.18.x) fails to load the
# model when a string carries a large `maxLength` — it raises "failed to load
# model vocabulary required for format" (qwen3 breaks above ~2000). These bounds
# are validation sanity limits, not generation guidance: the caller re-validates
# with Pydantic and retries, so we drop them from the grammar the model is
# constrained by while keeping them on the model.
_GRAMMAR_UNSAFE_KEYS = ("minLength", "maxLength")


def _grammar_safe_schema(node: object) -> object:
    """Recursively strip grammar-unsafe keys from a JSON Schema so Ollama can
    build a decoding grammar from it. Returns a new tree; input is untouched."""
    if isinstance(node, dict):
        return {
            k: _grammar_safe_schema(v)
            for k, v in node.items()
            if k not in _GRAMMAR_UNSAFE_KEYS
        }
    if isinstance(node, list):
        return [_grammar_safe_schema(v) for v in node]
    return node


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
        # `format` as a JSON Schema = constrained decoding; "json" = free JSON.
        # Sanitize the schema first: Ollama can't build a grammar for large string
        # length bounds (see _grammar_safe_schema).
        fmt = _grammar_safe_schema(schema) if schema is not None else "json"
        # think=False: thinking models (e.g. Qwen3) otherwise spend their budget
        # on suppressed reasoning under the grammar and return an EMPTY answer.
        # We want fast, structured generation here, not chain-of-thought. Ignored
        # by non-thinking models.
        try:
            resp = self._client.generate(
                model=self.model,
                prompt=prompt,
                format=fmt,
                think=False,
                options={"temperature": temperature},
            )
        except TypeError:  # older client without the `think` kwarg
            resp = self._client.generate(
                model=self.model, prompt=prompt, format=fmt, options={"temperature": temperature}
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
    """OpenAI-compatible chat-completions endpoint (OpenAI/OpenRouter/custom).

    ONLINE: every call sends the prompt (which contains source content) to the
    configured endpoint. Only built when the user explicitly enables BYO-key.
    Uses `response_format` for structured output when the endpoint supports it.
    """

    def __init__(self, model: str, endpoint: str, api_key: str, timeout: float = 60.0):
        self.model = model
        self.endpoint = endpoint.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    def health(self) -> bool:
        try:
            resp = httpx.get(f"{self.endpoint}/models", headers=self._headers(), timeout=10.0)
            return resp.status_code == 200
        except httpx.HTTPError:
            return False

    def generate(self, prompt: str, schema: dict | None = None, temperature: float = 0.1) -> dict:
        body: dict = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }
        if schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "arbora_item", "schema": schema, "strict": True},
            }
        else:
            body["response_format"] = {"type": "json_object"}

        try:
            resp = httpx.post(
                f"{self.endpoint}/chat/completions",
                headers=self._headers(),
                json=body,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise LLMUnavailableError(str(exc)) from exc
        if resp.status_code == 401:
            raise LLMUnavailableError("provider rejected the API key (401)")
        if resp.status_code >= 400:
            raise LLMUnavailableError(f"provider error {resp.status_code}: {resp.text[:200]}")

        try:
            content = resp.json()["choices"][0]["message"]["content"]
            return json.loads(content)
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            raise LLMSchemaError(f"provider did not return valid JSON: {exc}") from exc


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
