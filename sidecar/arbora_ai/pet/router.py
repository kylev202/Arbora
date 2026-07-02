"""Pet domain router — classify a message before answering it (law #1 guard).

The pet has exactly two valid domains:
  * ``lesson``   — questions about the user's own study material (RAG /chat).
  * ``app_help`` — questions about how to use Arbora (grounded in the packaged
    help KB).
Everything else is ``out_of_scope`` and gets a gentle refusal in the UI —
the pet never freewheels on general knowledge.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError

MAX_RETRIES = 2

Domain = Literal["lesson", "app_help", "out_of_scope"]


class RouteGen(BaseModel):
    """Flat schema the LLM fills under constrained decoding."""

    domain: Domain


_PROMPT = """You are a router for a study-app assistant. Classify the user's message
into exactly one domain:

- "lesson": asking about their course content, study material, homework concepts,
  or anything they would look up in their own lecture notes/readings.
- "app_help": asking how to use the Arbora app itself (its buttons, screens,
  features, settings, importing files, reviewing cards, calendar, and so on).
- "out_of_scope": anything else (weather, news, general chit-chat, coding help,
  personal advice, other apps).

Message: {question}

Return a JSON object with one key "domain".
"""


def route_question(question: str, provider: LLMProvider) -> Domain:
    """Classify one message. Raises LLMUnavailableError when Ollama is down and
    ValueError when the model can't produce a valid classification."""
    prompt = _PROMPT.format(question=question.strip())
    schema = RouteGen.model_json_schema()
    for attempt in range(MAX_RETRIES + 1):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.0 + attempt * 0.1)
            return RouteGen.model_validate(raw).domain
        except (LLMSchemaError, ValidationError):
            continue
    raise ValueError("router failed to classify the message")
