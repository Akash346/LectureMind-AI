from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from .errors import WorkerProcessingError
from .models import WorkerSegment


def transcribe_audio(
    audio_path: Path,
    language: str,
    max_duration_seconds: int,
) -> list[WorkerSegment]:
    key = os.getenv("AZURE_SPEECH_KEY", "").strip()
    region = os.getenv("AZURE_SPEECH_REGION", "").strip()
    speech_language = (
        language
        or os.getenv("AZURE_SPEECH_LANGUAGE", "").strip()
        or "en-US"
    )

    if not key or not region:
        raise WorkerProcessingError(
            "TRANSCRIPTION_FAILED",
            "Azure Speech environment variables are missing.",
            user_message="No captions were available and speech transcription is not configured yet.",
            retryable=False,
        )

    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError as error:
        raise WorkerProcessingError(
            "TRANSCRIPTION_FAILED",
            "Azure Speech SDK is not installed.",
            user_message="No captions were available and speech transcription is not configured yet.",
            retryable=False,
        ) from error

    speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
    speech_config.speech_recognition_language = speech_language
    try:
        speech_config.request_word_level_timestamps()
        speech_config.output_format = speechsdk.OutputFormat.Detailed
    except Exception:
        pass

    audio_config = speechsdk.audio.AudioConfig(filename=str(audio_path))
    recognizer = speechsdk.SpeechRecognizer(
        speech_config=speech_config,
        audio_config=audio_config,
    )

    done = threading.Event()
    cancellation: dict[str, str] = {}
    phrases: list[dict[str, Any]] = []

    def on_recognized(event: Any) -> None:
        result = event.result
        if result.reason != speechsdk.ResultReason.RecognizedSpeech:
            return

        text = (result.text or "").strip()
        if not text:
            return

        start_sec = ticks_to_seconds(getattr(result, "offset", 0))
        duration_sec = ticks_to_seconds(getattr(result, "duration", 0))
        confidence = extract_confidence(result, speechsdk)

        phrases.append(
            {
                "startSec": start_sec,
                "endSec": max(start_sec + duration_sec, start_sec + 2.5),
                "text": text,
                "confidence": confidence,
            }
        )

    def on_canceled(event: Any) -> None:
        cancellation["reason"] = str(getattr(event, "reason", "Canceled"))
        details = getattr(event, "error_details", None)
        if details:
            cancellation["details"] = str(details)
        done.set()

    def on_session_stopped(_event: Any) -> None:
        done.set()

    recognizer.recognized.connect(on_recognized)
    recognizer.canceled.connect(on_canceled)
    recognizer.session_stopped.connect(on_session_stopped)

    recognizer.start_continuous_recognition()
    completed = done.wait(timeout=max(180, min(max_duration_seconds * 3, 14400)))
    recognizer.stop_continuous_recognition()

    if not completed:
        raise WorkerProcessingError(
            "TRANSCRIPTION_FAILED",
            "Azure Speech recognition timed out.",
        )

    if cancellation and not phrases:
        raise WorkerProcessingError(
            "TRANSCRIPTION_FAILED",
            cancellation.get("details") or cancellation.get("reason"),
        )

    segments = group_phrases(phrases, speech_language)

    if not segments:
        raise WorkerProcessingError(
            "TRANSCRIPTION_FAILED",
            "Azure Speech returned no recognized text.",
        )

    return segments


def ticks_to_seconds(value: int | float) -> float:
    return max(float(value or 0) / 10_000_000, 0.0)


def extract_confidence(result: Any, speechsdk: Any) -> float:
    try:
        raw = result.properties.get(
            speechsdk.PropertyId.SpeechServiceResponse_JsonResult
        )
        payload = json.loads(raw)
        confidence = payload.get("NBest", [{}])[0].get("Confidence")
        if isinstance(confidence, (int, float)):
            return max(0.0, min(float(confidence), 1.0))
    except Exception:
        pass

    return 0.78


def group_phrases(
    phrases: list[dict[str, Any]],
    language: str,
) -> list[WorkerSegment]:
    segments: list[WorkerSegment] = []
    current: dict[str, Any] | None = None

    for phrase in sorted(phrases, key=lambda item: item["startSec"]):
        if current is None:
            current = {**phrase, "confidences": [phrase["confidence"]]}
            continue

        projected_duration = phrase["endSec"] - current["startSec"]
        gap = phrase["startSec"] - current["endSec"]
        should_merge = projected_duration <= 15 and gap <= 1.5

        if should_merge:
            current["endSec"] = max(current["endSec"], phrase["endSec"])
            current["text"] = f"{current['text']} {phrase['text']}".strip()
            current["confidences"].append(phrase["confidence"])
        else:
            segments.append(to_asr_segment(current, language))
            current = {**phrase, "confidences": [phrase["confidence"]]}

    if current is not None:
        segments.append(to_asr_segment(current, language))

    return segments


def to_asr_segment(item: dict[str, Any], language: str) -> WorkerSegment:
    confidences = item.get("confidences") or [0.78]
    confidence = sum(confidences) / len(confidences)
    return WorkerSegment(
        startSec=float(item["startSec"]),
        endSec=float(max(item["endSec"], item["startSec"] + 0.5)),
        text=str(item["text"]).strip(),
        sourceType="ASR",
        confidence=max(0.0, min(float(confidence), 1.0)),
        language=language,
        extractionEngine="azure-speech",
        rawSource="audio-asr",
    )
