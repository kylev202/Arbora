import numpy as np

from arbora_ai.rag.faiss_index import SubjectIndex


def test_add_search_save_load(tmp_path):
    rng = np.random.default_rng(0)
    vecs = rng.random((10, 8)).astype("float32")

    idx = SubjectIndex(dim=8)
    ids = idx.add(vecs)
    assert ids == list(range(10))
    assert idx.size == 10

    # The nearest neighbour of vector #2 is itself.
    _dist, found = idx.search(vecs[2], k=1)
    assert int(found[0][0]) == 2

    # Save + reload round-trips the index.
    path = tmp_path / "subject.index"
    idx.save(path)
    loaded = SubjectIndex.load(path)
    assert loaded.size == 10
    _dist2, found2 = loaded.search(vecs[2], k=1)
    assert int(found2[0][0]) == 2
