"""Pet domain router — classify a message before answering it (law #1 guard).

The pet serves exactly these intents:
  * ``lesson``   — questions about the user's own study material (RAG /chat).
  * ``app_help`` — questions about how to use Arbora (grounded in the packaged
    help KB).
  * ``schedule`` — asking the pet to plan/rearrange study sessions or handle
    deadlines (routed to the rule-based week planner, proposals only).
Everything else is ``out_of_scope`` and gets a gentle refusal in the UI —
the pet never freewheels on general knowledge.

Classification is conversation-aware: a bare follow-up ("why?", "and then?")
carries no domain signal on its own, so the recent turns are shown to the
router and short follow-ups inherit the domain they continue.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ValidationError

from ..llm.provider import LLMProvider, LLMSchemaError

MAX_RETRIES = 2
HISTORY_TURNS = 4  # most recent history entries shown to the router
HISTORY_CHARS = 200  # per-entry cap — the router needs the gist, not the essay

Domain = Literal["lesson", "app_help", "schedule", "out_of_scope"]


class RouteGen(BaseModel):
    """Flat schema the LLM fills under constrained decoding."""

    domain: Domain


_PROMPT = """You are a router for a study-app assistant. Classify the user's message
into exactly one domain:

- "lesson": asking about their course content, study material, homework concepts,
  or anything they would look up in their own lecture notes/readings.
- "app_help": asking how to use the Arbora app itself (its buttons, screens,
  features, settings, importing files, reviewing cards, calendar, and so on).
- "schedule": asking to plan or arrange study sessions, fill their week,
  reschedule a missed session, or set up deadline reminders.
- "out_of_scope": anything else (weather, news, general chit-chat, coding help,
  personal advice, other apps).

A short follow-up ("why?", "and then?", "what about the second one?") continues
the conversation — give it the same domain as the message it follows.

EXAMPLES:
"What does the Krebs cycle produce?" -> {{"domain": "lesson"}}
"How do I import my lecture slides?" -> {{"domain": "app_help"}}
"Plan my study week around Friday's deadline" -> {{"domain": "schedule"}}
"What's the weather tomorrow?" -> {{"domain": "out_of_scope"}}

{history_block}Message: {question}

Return a JSON object with one key "domain".
"""


def _history_block(history: list[dict]) -> str:
    lines = []
    for turn in history[-HISTORY_TURNS:]:
        content = " ".join(str(turn.get("content", "")).split())
        if len(content) > HISTORY_CHARS:
            content = content[:HISTORY_CHARS] + "…"
        speaker = "User" if turn.get("role") == "user" else "Assistant"
        lines.append(f"{speaker}: {content}")
    return "Conversation so far:\n" + "\n".join(lines) + "\n\n"


def route_question(
    question: str, provider: LLMProvider, history: list[dict] | None = None
) -> Domain:
    """Classify one message (with optional recent turns for follow-up context).
    Raises LLMUnavailableError when Ollama is down and ValueError when the
    model can't produce a valid classification."""
    prompt = _PROMPT.format(
        question=question.strip(),
        history_block=_history_block(history) if history else "",
    )
    schema = RouteGen.model_json_schema()
    for attempt in range(MAX_RETRIES + 1):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.0 + attempt * 0.1)
            return RouteGen.model_validate(raw).domain
        except (LLMSchemaError, ValidationError):
            continue
    raise ValueError("router failed to classify the message")
