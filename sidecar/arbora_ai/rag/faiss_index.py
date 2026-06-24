"""Per-subject FAISS index.

One index file per subject (`faiss/{subject_id}.index`). A vector's position in
the index is its `faiss_id`, which maps back to a row in the `chunks` table for
citation (see resources/Phase1_Data_Model.md §3.3).
"""

from __future__ import annotations

from pathlib import Path

import faiss
import numpy as np


class SubjectIndex:
    """A flat L2 index. `faiss_id` == insertion position (ntotal-based)."""

    def __init__(self, dim: int):
        self.dim = dim
        self.index = faiss.IndexFlatL2(dim)

    def add(self, vectors: np.ndarray) -> list[int]:
        """Add vectors, returning the assigned faiss_ids (their positions)."""
        vectors = np.ascontiguousarray(vectors, dtype="float32")
        start = self.index.ntotal
        self.index.add(vectors)
        return list(range(start, self.index.ntotal))

    def search(self, query: np.ndarray, k: int = 5) -> tuple[np.ndarray, np.ndarray]:
        """Return (distances, faiss_ids) for the top-k nearest vectors."""
        query = np.ascontiguousarray(query, dtype="float32")
        if query.ndim == 1:
            query = query.reshape(1, -1)
        return self.index.search(query, k)

    @property
    def size(self) -> int:
        return self.index.ntotal

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(path))

    @classmethod
    def load(cls, path: str | Path) -> SubjectIndex:
        index = faiss.read_index(str(path))
        obj = cls.__new__(cls)
        obj.index = index
        obj.dim = index.d
        return obj
