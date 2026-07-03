"""Arbora Spike CLI — offline document → grounded, cited cards/quiz/notes.

    python -m arbora_ai.cli path/to/doc.pdf --types cards,quiz

Proves the AI core end-to-end on real documents (Phase-3 Spike DoD): parse →
chunk → constrained local generation → schema-validate → grounding check →
quality report. Local-only (Ollama) — Arbora is local-first. Nothing here is
trusted until reviewed in the app (law #2). Flashcards live in Arbora's own
in-app review loop; the Anki export was removed with the subject-view redesign.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import DEFAULT_PRESET, default_model
from .generate import generate_from_chunks
from .ingest import chunk_units, parse_source
from .ingest.parse import detect_type
from .llm.provider import LLMUnavailableError, get_provider


def _report(stats: dict) -> None:
    print("\n── Quality report ───────────────────────────────")
    for t, s in stats.items():
        print(
            f"  {t:6} attempts={s.attempts:3}  accepted={s.accepted:3}  "
            f"({s.acceptance_rate * 100:4.0f}% accepted)  "
            f"structure_fail={s.structure_fails}  grounding_drop={s.grounding_drops}  "
            f"dedupe={s.dedupe_drops}"
        )
        for reason, n in sorted(s.drop_reasons.items(), key=lambda kv: -kv[1]):
            print(f"            - dropped {n}×: {reason}")


def main(argv: list[str] | None = None) -> int:
    # The report uses box-drawing/quote glyphs; force UTF-8 so it survives a
    # legacy Windows console (cp1252) instead of crashing on encode.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(prog="arbora-spike", description=__doc__)
    p.add_argument("file", type=Path, help="PDF, .pptx, or audio file")
    p.add_argument("--types", default="cards", help="comma list: cards,quiz,notes")
    p.add_argument("--preset", default=DEFAULT_PRESET, choices=["low", "medium", "high"])
    p.add_argument("--model", default=None, help="override the Ollama model (e.g. qwen3:4b)")
    p.add_argument("--max-chunks", type=int, default=0, help="cap chunks (0 = all)")
    args = p.parse_args(argv)

    if not args.file.exists():
        print(f"error: file not found: {args.file}", file=sys.stderr)
        return 2

    types = [t.strip() for t in args.types.split(",") if t.strip()]
    source_id = args.file.stem

    # 1. Ingest → located chunks
    print(f"Parsing {args.file.name} ({detect_type(args.file)})…", file=sys.stderr)
    units = parse_source(args.file)
    chunks = chunk_units(units, source_id=source_id)
    if args.max_chunks:
        chunks = chunks[: args.max_chunks]
    print(f"  {len(units)} units → {len(chunks)} chunks", file=sys.stderr)
    if not chunks:
        print("error: no usable text extracted (scanned PDF / empty file?)", file=sys.stderr)
        return 1

    # 2. Provider (local Ollama only — Arbora is local-first)
    config = {"provider": "ollama", "model": args.model or default_model(args.preset)}
    provider = get_provider(config)
    if not provider.health():
        print("error: Ollama not reachable (is `ollama serve` running?)", file=sys.stderr)
        return 1
    print(f"  provider=ollama model={config['model']}", file=sys.stderr)

    # 3. Generate (grounded, cited) → validate → ground-check
    print(f"Generating {types} from {len(chunks)} chunks…", file=sys.stderr)
    try:
        result, stats = generate_from_chunks(provider, chunks, types)
    except LLMUnavailableError as exc:
        print(f"error: generation failed: {exc}", file=sys.stderr)
        return 1

    _report(stats)

    # 4. Show a few grounded samples
    if result.cards:
        print("\n── Sample cards ─────────────────────────────────")
        for c in result.cards[:3]:
            loc = c.source_ref.location
            where = f"p.{loc.page}" if loc.type == "page" else f"{loc.timestamp_ms // 1000}s"
            print(f"  Q: {c.front}")
            print(f"  A: {c.back}")
            print(f"  cite: {c.source_ref.source_id} · {where} — “{c.source_ref.excerpt}”\n")

    accepted = sum(s.accepted for s in stats.values())
    print(f"\nDone. {accepted} grounded items kept.")
    return 0 if accepted > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
