import os

import pytest

from arbora_ai.rag.embeddings import embed_texts
from arbora_ai.rag.faiss_index import SubjectIndex

# Needs a running Ollama with the embedding model pulled.
pytestmark = pytest.mark.skipif(
    not os.environ.get("ARBORA_RUN_INTEGRATION"),
    reason="set ARBORA_RUN_INTEGRATION=1 to run (needs Ollama + embed model)",
)


def test_embed_then_index_roundtrip(tmp_path):
    vecs = embed_texts(
        [
            "Photosynthesis converts light into chemical energy.",
            "Mitochondria are the powerhouse of the cell.",
        ]
    )
    assert vecs.shape[0] == 2
    assert vecs.shape[1] > 0  # nomic-embed-text → 768 dims

    idx = SubjectIndex(dim=vecs.shape[1])
    assert idx.add(vecs) == [0, 1]

    path = tmp_path / "subject.index"
    idx.save(path)
    loaded = SubjectIndex.load(path)

    # Querying with the first embedding returns its own faiss_id.
    _dist, found = loaded.search(vecs[0], k=1)
    assert int(found[0][0]) == 0
