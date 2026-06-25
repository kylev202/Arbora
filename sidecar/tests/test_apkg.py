import zipfile

from arbora_ai.export.apkg import export_apkg
from arbora_ai.schemas.output import CardOut, PageLocation, SourceRef


def _card(front):
    return CardOut(
        front=front,
        back="The eardrum",
        explanation="A thin membrane.",
        source_ref=SourceRef(source_id="bio", location=PageLocation(page=5), excerpt="the eardrum vibrates"),
    )


def test_export_writes_valid_apkg(tmp_path):
    out = tmp_path / "deck.apkg"
    path = export_apkg([_card("What vibrates?"), _card("Where is the eardrum?")], "Biology", out)

    assert path.exists() and path.stat().st_size > 0
    # An .apkg is a zip containing an SQLite "collection.anki2".
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
    assert any("collection.anki" in n for n in names)


def test_export_empty_is_valid(tmp_path):
    path = export_apkg([], "Empty", tmp_path / "e.apkg")
    assert path.exists()
