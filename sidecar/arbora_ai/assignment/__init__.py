"""Assignment spec + rubric → structured extraction.

Turns an uploaded assignment brief/spec into editable requirements, process
steps, and a plan to finish; and a marking rubric into criteria × levels.
Same posture as the outline import (ADR-0006): structured extraction the user
confirms before commit — the core writes nothing until then.
"""

from .extract import extract_rubric, extract_spec

__all__ = ["extract_rubric", "extract_spec"]
