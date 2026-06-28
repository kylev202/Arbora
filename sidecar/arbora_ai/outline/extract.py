"""Parse a syllabus to text, then extract a structured outline from it.

The pipeline mirrors `generate/pipeline.py`: build a prompt → constrained
generate against the Pydantic schema → validate → retry a bounded number of
times → on exhaustion raise. We never parse free text (llm-grounding). The LLM
is instructed to extract *only* what the syllabus contains; the user then
reviews and edits every row before anything is committed.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import ValidationError

from ..ingest.parse import parse_docx, parse_pdf, parse_pptx
from ..llm.provider import LLMProvider, LLMSchemaError
from ..schemas.output import OutlineExtraction

MAX_STRUCTURE_RETRIES = 3

# Small local models have a small context window; a long syllabus would overflow
# it. Syllabi put the schedule up front, so the head is what matters.
MAX_SYLLABUS_CHARS = 12000

_PDF = {".pdf"}
_SLIDE = {".pptx", ".ppt"}
_WORD = {".docx"}
_TEXT = {".txt", ".md", ".markdown"}


def syllabus_to_text(file_path: str | Path) -> str:
    """Read a syllabus file into one plain-text blob (truncated to the model's
    budget). Raises ValueError for an unsupported extension or unreadable content."""
    ext = Path(file_path).suffix.lower()
    try:
        if ext in _PDF:
            text = "\n\n".join(u.text for u in parse_pdf(file_path))
        elif ext in _SLIDE:
            text = "\n\n".join(u.text for u in parse_pptx(file_path))
        elif ext in _WORD:
            text = "\n\n".join(u.text for u in parse_docx(file_path))
        elif ext in _TEXT:
            text = Path(file_path).read_text(encoding="utf-8", errors="replace")
        else:
            raise ValueError(
                f"unsupported syllabus type: {ext!r} (use PDF, Word, PowerPoint, or a text file)"
            )
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"could not read the file: {exc}") from exc
    text = text.strip()
    if not text:
        raise ValueError(
            "no text could be extracted from this file — it may be a scanned image PDF"
        )
    return text[:MAX_SYLLABUS_CHARS]


def outline_prompt(text: str) -> str:
    """Instruction for the extraction. Forbids inventing anything not present
    (law #1 in spirit) and asks for ISO dates so the UI can pre-fill them."""
    return (
        "You are extracting the schedule from a university unit syllabus.\n"
        "Use ONLY information stated in the syllabus below. Do NOT invent weeks, "
        "topics, or dates — if the syllabus doesn't list something, leave it out.\n\n"
        "Return JSON with two arrays:\n"
        "- weeks: each {week_number (1-based int), title (the week's topic), "
        "summary (what it covers, may be empty)}.\n"
        "- deadlines: each {title (e.g. 'Assignment 1', 'Final exam'), "
        "due_date (ISO YYYY-MM-DD if a date is given, else empty string), "
        "type (one of 'exam', 'assignment', 'other')}.\n"
        "If the syllabus lists no weeks or no deadlines, return an empty array "
        "for that field.\n\n"
        "--- SYLLABUS ---\n"
        f"{text}\n"
        "--- END SYLLABUS ---"
    )


def extract_outline(provider: LLMProvider, text: str) -> OutlineExtraction:
    """Constrained-generate the outline and validate it, retrying structure
    failures. Raises LLMSchemaError if the model never returns a valid shape."""
    schema = OutlineExtraction.model_json_schema()
    prompt = outline_prompt(text)
    last_err: Exception | None = None
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            return OutlineExtraction.model_validate(raw)
        except (LLMSchemaError, ValidationError) as exc:
            last_err = exc
            continue
    raise LLMSchemaError(f"could not extract a structured outline after retries: {last_err}")
