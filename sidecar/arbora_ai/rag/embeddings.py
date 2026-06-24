"""Text embeddings via Ollama (local), used to index chunks for RAG."""

from __future__ import annotations

import numpy as np
import ollama

from ..config import EMBED_MODEL, OLLAMA_ENDPOINT


def embed_texts(
    texts: list[str],
    model: str = EMBED_MODEL,
    endpoint: str = OLLAMA_ENDPOINT,
) -> np.ndarray:
    """Embed a list of texts into a float32 (n, dim) matrix ready for FAISS."""
    client = ollama.Client(host=endpoint)
    vectors: list[list[float]] = []
    for text in texts:
        resp = client.embeddings(model=model, prompt=text)
        embedding = resp["embedding"] if isinstance(resp, dict) else resp.embedding
        vectors.append(list(embedding))
    return np.asarray(vectors, dtype="float32")
