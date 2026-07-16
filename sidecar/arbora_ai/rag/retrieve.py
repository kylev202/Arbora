"""Hybrid retrieval — semantic (FAISS) + keyword (BM25) fused by reciprocal rank.

Vector search catches concepts and paraphrases; BM25 catches the exact
technical vocabulary (names, formulas, unit codes) that embeddings blur. Fusing
the two rankings fixes the classic RAG failure where "What is the Krebs cycle?"
retrieves vaguely-metabolic chunks but misses the one that literally defines
the term. Neighbour expansion then re-attaches the chunks directly before/after
each hit in the same source, so an idea split across a chunk boundary arrives
whole. Pure functions over the chunk dicts the core already sends — no state,
no new dependencies, cheap enough for the low-RAM preset.
"""

from __future__ import annotations

import math
import re
from collections import Counter

_TOKEN = re.compile(r"[a-z0-9]+")

# Tiny stopword list — just enough that BM25 never ranks on glue words.
_STOP = frozenset(
    "a an and are as at be but by for from has have if in into is it its of on or "
    "that the their there these this to was were what when which who will with".split()
)

_RRF_K = 60  # standard reciprocal-rank-fusion constant


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


def bm25_rank(query: str, docs: list[str], k1: float = 1.5, b: float = 0.75) -> list[int]:
    """Rank doc positions by Okapi BM25 against the query, best first.
    Docs that match no query term are excluded (a zero score is not a rank)."""
    query_terms = set(tokenize(query))
    if not query_terms or not docs:
        return []
    doc_tokens = [tokenize(d) for d in docs]
    n = len(docs)
    avgdl = (sum(len(t) for t in doc_tokens) / n) or 1.0
    df: Counter[str] = Counter()
    for tokens in doc_tokens:
        df.update(set(tokens))
    scores: list[float] = []
    for tokens in doc_tokens:
        tf = Counter(tokens)
        dl = len(tokens) or 1
        score = 0.0
        for term in query_terms:
            if term not in tf:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            score += idf * tf[term] * (k1 + 1) / (tf[term] + k1 * (1 - b + b * dl / avgdl))
        scores.append(score)
    return [i for i in sorted(range(n), key=lambda i: scores[i], reverse=True) if scores[i] > 0]


def fuse_ranks(rankings: list[list[int]], k: int) -> list[int]:
    """Reciprocal-rank fusion: score(pos) = Σ 1/(K + rank). Returns top-k
    positions. Robust to the two engines scoring on incomparable scales."""
    scores: dict[int, float] = {}
    for ranking in rankings:
        for rank, pos in enumerate(ranking):
            scores[pos] = scores.get(pos, 0.0) + 1.0 / (_RRF_K + rank)
    return sorted(scores, key=lambda pos: scores[pos], reverse=True)[:k]


def expand_neighbors(selected: list[int], chunks: list[dict], max_extra: int = 4) -> list[int]:
    """Add the chunks adjacent to each hit (same source, previous/next position)
    so a sentence split across a chunk boundary is readable in context. Within a
    source_id the incoming list is already in chunk_index order (the core sends
    it that way), so group order == reading order. Each anchor's block is
    emitted in reading order; anchors stay in fused-relevance order."""
    by_source: dict[str, list[int]] = {}
    for pos, chunk in enumerate(chunks):
        by_source.setdefault(chunk["source_id"], []).append(pos)
    index_of: dict[int, tuple[list[int], int]] = {}
    for group in by_source.values():
        for i, pos in enumerate(group):
            index_of[pos] = (group, i)

    seen = set(selected)
    out: list[int] = []
    extra = 0
    for anchor in selected:
        block = [anchor]
        group, i = index_of[anchor]
        for j in (i - 1, i + 1):
            if 0 <= j < len(group) and extra < max_extra and group[j] not in seen:
                seen.add(group[j])
                block.append(group[j])
                extra += 1
        out.extend(sorted(block))
    return out


def hybrid_select(
    question: str,
    chunks: list[dict],
    vector_positions: list[int],
    k: int,
    max_extra: int = 4,
) -> list[int]:
    """Fuse a FAISS ranking (positions into `chunks`, best first) with a BM25
    ranking over the same chunks, then expand with same-source neighbours.
    Returns the ordered positions of the passages to hand to the LLM."""
    keyword_positions = bm25_rank(question, [c["text"] for c in chunks])[: max(2 * k, 10)]
    fused = fuse_ranks([vector_positions, keyword_positions], k)
    if not fused:
        return []
    return expand_neighbors(fused, chunks, max_extra=max_extra)
