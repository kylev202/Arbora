import pytest

from arbora_ai.ingest.chunk import chunk_units
from arbora_ai.ingest.parse import SourceUnit, detect_type, parse_docx, parse_pdf, parse_text


@pytest.mark.parametrize("ext", ["mp3", "m4a", "wav", "ogg", "flac", "aac", "mp4", "mkv", "webm", "avi", "mov"])
def test_detect_type_audio_and_video(ext):
    assert detect_type(f"lecture.{ext}") == "audio"


def test_detect_type_pdf_and_slide():
    assert detect_type("notes.pdf") == "pdf"
    assert detect_type("deck.pptx") == "slide"


def test_detect_type_doc_and_text():
    assert detect_type("essay.docx") == "doc"
    assert detect_type("notes.txt") == "text"
    assert detect_type("README.md") == "text"
    assert detect_type("guide.markdown") == "text"


def test_detect_type_rejects_unknown():
    with pytest.raises(ValueError, match="unsupported"):
        detect_type("archive.zip")


def test_parse_text_splits_paragraphs(tmp_path):
    path = tmp_path / "notes.md"
    path.write_text(
        "# Cell biology\n\nThe mitochondrion is the powerhouse of the cell.\n\n\nRibosomes synthesise proteins.\n",
        encoding="utf-8",
    )

    units = parse_text(path)
    assert len(units) == 3
    assert units[0].location == {"type": "page", "page": 1}
    assert "mitochondrion" in units[1].text
    assert units[2].location == {"type": "page", "page": 3}


def test_parse_docx_reads_paragraphs(tmp_path):
    from docx import Document

    path = tmp_path / "syllabus.docx"
    doc = Document()
    doc.add_paragraph("Week 1: Introduction to Biology")
    doc.add_paragraph("Week 2: Cell Structure and Function")
    doc.add_paragraph("")  # blank paragraph — should be skipped
    doc.add_paragraph("Final exam: June 20")
    doc.save(str(path))

    units = parse_docx(path)
    assert len(units) == 3
    assert units[0].location == {"type": "page", "page": 1}
    assert "Introduction" in units[0].text
    assert units[2].location == {"type": "page", "page": 3}


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
