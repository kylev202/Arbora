# ADR-0011: Subject-aware generation and how synthesized math is grounded

- **Status:** Accepted
- **Date:** 2026-07-08

## Update (2026-07-11): math typesetting extended beyond `math`

The original decision typeset LaTeX only for `discipline == "math"` and gave `cs`
code formatting alone. In practice quantitative content is mathematical across
disciplines — a gradient-descent / backpropagation note under a `cs` subject is as
formula-dense as a calculus one, and physics/chemistry under `science` likewise —
so those notes were rendering their formulas as raw text. The `discipline_overlay`
now emits the **math** block for `math`, `science`, and `cs` (with `cs` also keeping
its **code** block); `general` and `humanities` stay plain text. The grounding
posture is unchanged: the verbatim excerpt still grounds the prose, the typeset
maths is the review-gated aid. Nothing else in this ADR changes.

## Context

Arbora targets any mainstream university course, but generation has been
subject-blind: one generic tutor prompt, and a note house style that forbids
tables and images and emits no maths or code. A calculus note reads the same as a
history note. Students in quantitative and CS courses need equations typeset (not
`x2` extracted from a slide) and code shown as code.

The obstacle is Law #1 (ADR-0002): every generated item carries an **excerpt
copied verbatim** from its source chunk, and `generate/grounding.py` drops
anything whose excerpt is not a real substring of the chunk. Clean LaTeX almost
never appears verbatim in a source — lecture PDFs store equations as images or as
garbled text extraction (`x2 + 2x`). So if the model *reconstructs* an equation as
LaTeX and cites the LaTeX, the item is dropped. And the lexical safety net
(`answer_supported`) strips all symbols, so a synthesized equation with a wrong
exponent or flipped sign passes undetected — exactly the hallucination the laws
exist to catch.

We want subject-adaptive material without weakening the grounding contract.

## Decision

We will make generation **subject-aware** via a per-subject `discipline`
(`general` · `math` · `cs` · `science` · `humanities`, default `general`, stored on
the `subjects` row), threaded UI → core → sidecar into a prompt **overlay**
(`generate/prompts.discipline_overlay`).

We will treat synthesized maths/code as a **rendered aid, not a cited claim**:

- The **verbatim excerpt still grounds the surrounding prose** — the sentence that
  introduces or states the result — exactly as before. Law #1 is unchanged; the
  excerpt is never the LaTeX/code the model wrote.
- The **equation/code itself is trusted only through the Law #2 review gate**: it
  lives inside a note the human approves before it enters the deck. The overlay
  instructs the model to reproduce only the mathematics/code the passage states and
  never to invent steps, values, or notation.

We will ship this for **notes first**, on the `math` and `cs` disciplines. The
note renderer (`NoteMarkdown`) gains KaTeX (`$…$`, `$$…$$`) and fenced code blocks.

## Alternatives considered

- **Relax the verbatim-excerpt rule for maths** — fastest, but it guts Law #1 for
  precisely the content where a subtle error is most damaging and least visible.
  Rejected.
- **Extract real equations at ingest (OCR / formula extraction) and match against
  them** — the most faithful option, and the eventual home for true equation
  grounding, but a large ingest investment we are not taking on now. Deferred, not
  rejected; this ADR does not preclude it.
- **One mega-prompt covering every subject at once** — dilutes quality on the
  low-preset model (Qwen3 4B) and is untestable. Rejected in favour of a small,
  additive overlay per discipline.
- **Apply the overlay to cards/quizzes too, now** — rejected for this slice: the
  flashcard/quiz/test surfaces render plain text and read answers aloud via TTS, so
  emitting LaTeX there would show raw `$…$` and speak it. Cards/quizzes are a
  follow-up slice that must also handle the spoken form.

## Consequences

- **Easier:** math/CS notes are legible (typeset equations, real code blocks) with
  no change to the grounding machinery; adding a discipline is one small overlay
  plus, where needed, renderer support.
- **Constrained / honest downsides:**
  - The equation's *correctness* now rests on the human reviewer (Law #2), not on a
    lexical check. A reviewer who rubber-stamps a note can approve a wrong equation.
    This is the accepted cost of rendering synthesized maths at all; the overlay
    minimises it by forbidding invented content, and true verification waits on the
    ingest-extraction alternative above.
  - `general` subjects and all cards/quizzes are byte-for-byte unchanged, so the
    blast radius is small — but it also means math currently renders in notes only,
    an intentional, temporary asymmetry recorded here so the next slice closes it.
