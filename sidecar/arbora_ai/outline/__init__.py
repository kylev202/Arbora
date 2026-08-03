"""Syllabus → structured outline extraction (slice 4).

Turns a user-uploaded syllabus into editable weeks + deadlines (plus unit info:
code, coordinator, classes, assessments) under Pydantic schemas. This is
structured *extraction the user confirms before commit* (ADR-0006), not
grounded study content — the core writes nothing until the user accepts the
reviewed result.
"""

from .extract import extract_outline, extract_unit_info, syllabus_to_text
from .plan import extract_unit_plan

__all__ = [
    "extract_outline",
    "extract_unit_info",
    "extract_unit_plan",
    "syllabus_to_text",
]
