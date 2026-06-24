"""faster-whisper transcription.

Returns timestamped segments so audio chunks can carry a citation
(`timestamp_ms`) back to the source, matching the chunks table.
"""

from __future__ import annotations

from dataclasses import dataclass

from faster_whisper import WhisperModel


@dataclass
class Segment:
    text: str
    start_ms: int
    end_ms: int


class Transcriber:
    """Lazily-loaded Whisper model. `model_size` maps to the settings preset
    (tiny/base/small)."""

    def __init__(self, model_size: str = "base", device: str = "cpu", compute_type: str = "int8"):
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._model: WhisperModel | None = None

    def _ensure_loaded(self) -> WhisperModel:
        if self._model is None:
            self._model = WhisperModel(
                self._model_size, device=self._device, compute_type=self._compute_type
            )
        return self._model

    def transcribe(self, audio_path: str, vad_filter: bool = True) -> list[Segment]:
        model = self._ensure_loaded()
        segments, _info = model.transcribe(audio_path, vad_filter=vad_filter)
        return [
            Segment(
                text=seg.text.strip(),
                start_ms=int(seg.start * 1000),
                end_ms=int(seg.end * 1000),
            )
            for seg in segments
        ]
