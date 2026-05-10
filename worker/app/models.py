from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


WorkerErrorType = Literal[
    "PRIVATE_VIDEO",
    "LIVE_STREAM_ACTIVE",
    "AGE_RESTRICTED",
    "REGION_BLOCKED",
    "NO_CAPTIONS",
    "TRANSCRIPT_UNAVAILABLE",
    "AUDIO_EXTRACTION_FAILED",
    "TRANSCRIPTION_FAILED",
    "UNSUPPORTED_URL",
    "VIDEO_TOO_LONG",
    "RATE_LIMITED",
    "NETWORK_ERROR",
    "WORKER_UNAVAILABLE",
    "UNKNOWN",
]

SourceType = Literal["CAPTION", "AUTO_CAPTION", "ASR"]


class ProcessYouTubeRequest(BaseModel):
    notebookId: str = Field(min_length=1)
    videoUrl: str = Field(min_length=1)
    videoId: str = Field(min_length=1)
    preferredLanguage: str = "en"
    allowAsrFallback: bool = True
    maxDurationSeconds: int = 10800


class WorkerMetadata(BaseModel):
    videoId: str
    title: str
    author: str | None = None
    thumbnailUrl: str | None = None
    durationSec: int | None = None
    isLive: bool = False
    normalizedUrl: str


class WorkerSegment(BaseModel):
    startSec: float
    endSec: float
    text: str
    sourceType: SourceType
    confidence: float = 1.0
    language: str | None = None
    extractionEngine: Literal[
        "yt-dlp-caption",
        "yt-dlp-auto-caption",
        "azure-speech",
    ]
    rawSource: Literal["manual-caption", "auto-caption", "audio-asr"]


class WorkerDiagnostics(BaseModel):
    engine: str = "yt-dlp"
    captionTrackFound: bool = False
    asrUsed: bool = False
    segmentCount: int = 0
    requestId: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class WorkerError(BaseModel):
    type: WorkerErrorType
    userTitle: str
    userMessage: str
    retryable: bool = False


class WorkerSuccessResponse(BaseModel):
    status: Literal["READY"] = "READY"
    metadata: WorkerMetadata
    segments: list[WorkerSegment]
    diagnostics: WorkerDiagnostics


class WorkerFailureResponse(BaseModel):
    status: Literal["FAILED"] = "FAILED"
    error: WorkerError
    diagnostics: WorkerDiagnostics


WorkerProcessResponse = WorkerSuccessResponse | WorkerFailureResponse
