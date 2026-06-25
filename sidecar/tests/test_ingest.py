from arbora_ai.ingest.chunk import chunk_units
from arbora_ai.ingest.parse import SourceUnit, parse_pdf


def test_chunk_keeps_location_and_splits_long_text():
    long = " ".join(f"Sentence number {i} about cells." for i in range(60))
    units = [SourceUnit(text=long, location={"type": "page", "page": 2})]
    chunks = chunk_units(units, source_id="bio", max_chars=200)
    assert len(chunks) > 1
    assert all(c.location == {"type": "page", "page": 2} for c in chunks)
    assert all(c.source_id == "bio" for c in chunks)
    assert all(len(c.text) <= 200 for c in chunks)


def test_chunk_drops_tiny_fragments():
    units = [SourceUnit(text="Title", location={"type": "page", "page": 1})]
    assert chunk_units(units, source_id="s", min_chars=40) == []


def test_parse_pdf_reads_pages_with_numbers(tmp_path):
    import pymupdf

    path = tmp_path / "doc.pdf"
    doc = pymupdf.open()
    for i in range(3):
        page = doc.new_page()
        page.insert_text((72, 72), f"This is page {i + 1} about photosynthesis and chloroplasts.")
    doc.save(str(path))
    doc.close()

    units = parse_pdf(path)
    assert len(units) == 3
    assert units[0].location == {"type": "page", "page": 1}
    assert "page 1" in units[0].text
    assert units[2].location["page"] == 3
