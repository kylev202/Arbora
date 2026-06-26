"""Syllabus → structured outline extraction (slice 4).

Turns a user-uploaded syllabus into editable weeks + deadlines under a Pydantic
schema. This is structured *extraction the user confirms before commit*
(ADR-0006), not grounded study content — the core writes nothing until the user
accepts the reviewed result.
"""

from .extract import extract_outline, syllabus_to_text

__all__ = ["extract_outline", "syllabus_to_text"]
