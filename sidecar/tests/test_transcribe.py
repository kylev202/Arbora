import os
from pathlib import Path

import pytest

from arbora_ai.transcribe.whisper import Transcriber

# Needs the whisper base model (downloaded on first use).
pytestmark = pytest.mark.skipif(
    not os.environ.get("ARBORA_RUN_INTEGRATION"),
    reason="set ARBORA_RUN_INTEGRATION=1 to run (downloads the whisper model)",
)


def test_transcribe_sample():
    wav = Path(__file__).parent / "fixtures" / "sample_audio.wav"
    assert wav.exists(), "sample fixture missing"

    segments = Transcriber(model_size="base").transcribe(str(wav))
    text = " ".join(s.text for s in segments).strip()

    assert text, "transcription was empty"
    assert len(text.split()) >= 3, f"unexpectedly short transcription: {text!r}"
