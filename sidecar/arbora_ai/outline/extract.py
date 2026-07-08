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
from ..llm.provider import LLMProvider, LLMSchemaError, LLMUnavailableError
from ..schemas.output import OutlineExtraction, UnitInfoExtraction

MAX_STRUCTURE_RETRIES = 3

# Small local models have a small context window; a long syllabus would overflow
# it. Syllabi put the schedule up front, so the head is what matters.
MAX_SYLLABUS_CHARS = 12000

# Unit info (code, coordinator, classes, assessment table) sits even closer to
# the top of a syllabus, so the second extraction call reads a shorter head.
MAX_UNIT_INFO_CHARS = 8000

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


def unit_info_prompt(text: str) -> str:
    """Instruction for the unit-info extraction (call 2 of /parse-outline)."""
    return (
        "You are extracting key unit information from a university unit syllabus.\n"
        "Use ONLY information stated in the syllabus below. Do NOT invent "
        "anything — leave a field as an empty string (or an array empty) if the "
        "syllabus doesn't state it.\n\n"
        "Return JSON with:\n"
        "- unit_code: the unit/course code (e.g. 'COMP1010').\n"
        "- coordinator_name: the unit coordinator or lecturer in charge.\n"
        "- coordinator_contact: their email or other contact given.\n"
        "- delivery_summary: 1-3 sentences on how the unit runs (delivery mode, "
        "weekly structure, expectations).\n"
        "- classes: each {label (e.g. 'Lecture', 'Tutorial', 'Lab'), schedule "
        "(day and time as written, e.g. 'Wed 10:00-11:00', else empty), mode "
        "(e.g. 'on-campus', 'online', else empty), attendance (what attendance "
        "is expected or required, e.g. 'attendance is a hurdle requirement', "
        "else empty)}.\n"
        "- assessments: each {name (e.g. 'Assignment 1'), weight_percent "
        "(number 0-100, 0 if no weighting is stated), due_text (the due date/"
        "week exactly as written, else empty)}.\n\n"
        "--- SYLLABUS ---\n"
        f"{text}\n"
        "--- END SYLLABUS ---"
    )


def extract_unit_info(provider: LLMProvider, text: str) -> UnitInfoExtraction:
    """Constrained-generate the unit info. Unlike the outline, any failure
    degrades to an empty UnitInfoExtraction instead of raising: the schedule is
    the point of the parse, unit info is a bonus the user can type in. That
    includes the provider dying mid-request — the caller already has the
    outline by then, and a 503 would throw it away."""
    schema = UnitInfoExtraction.model_json_schema()
    prompt = unit_info_prompt(text[:MAX_UNIT_INFO_CHARS])
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = provider.generate(prompt, schema=schema, temperature=0.1 + attempt * 0.05)
            return UnitInfoExtraction.model_validate(raw)
        except (LLMSchemaError, ValidationError, LLMUnavailableError):
            continue
    return UnitInfoExtraction()
