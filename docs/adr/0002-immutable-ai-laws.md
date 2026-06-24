# ADR-0002: Three immutable AI-safety laws

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

Arbora generates study material — notes, flashcards, quizzes — that a learner will
trust and memorize. Two failure modes are unacceptable for a study tool:

1. **Hallucination** — confidently teaching something the sources never said.
2. **Silent data egress** — a "local-first" app quietly shipping a user's private
   documents to a cloud service.

These risks are inherent to LLM features, so the defenses cannot be a per-feature
afterthought. They have to be invariants the whole codebase is built around.

## Decision

Three laws bind every feature that touches AI. They are non-negotiable; a change that
violates one is a bug, not a trade-off.

1. **Grounded + cited.** Generation runs only over content retrieved from the user's
   own sources, and every produced item carries a citation back to a page or
   timestamp. An item that can't be traced to a source is rejected, not warned about.
2. **Review-before-trust.** No AI-generated item is persisted as trusted until a
   human approves it in the review gate. Generated output is staged, never silently
   promoted into the deck.
3. **Local-first.** The core never sends data off-device. Any online / BYO-key path
   lives in isolated modules behind an explicit, clearly-labelled opt-in flag and is
   never imported by the core.

## Alternatives considered

- **Trust-the-model (no grounding/citations)** — simpler, faster to build; rejected
  outright — it makes the core product (reliable study material) untrustworthy.
- **Auto-accept AI items with a confidence score** — still lets unreviewed,
  possibly-wrong items into the deck; rejected. Review is a gate, not a suggestion.
- **Cloud-by-default with a privacy toggle** — inverts the safe default; rejected.
  Local is the default; online is the deliberate exception.

## Consequences

- **Easier:** users can trust the output; privacy is a structural guarantee, not a
  promise; the boundary for any future audit is small and explicit.
- **Harder / accepted cost:** every generation path must carry retrieval context and
  citations (structured output, validate-then-retry — the `llm-grounding` and
  `rag-sidecar` skills); the review gate is mandatory UX surface area; network code
  is quarantined and slightly more awkward to write. We accept all of it.

These laws are enforced in code, restated in [CONTRIBUTING](../../CONTRIBUTING.md),
[README](../../README.md), and [CLAUDE.md](../../CLAUDE.md), and backed by the
`llm-grounding`, `rag-sidecar`, and `fsrs-srs` skills.
