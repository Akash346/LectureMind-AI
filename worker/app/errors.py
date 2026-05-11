from __future__ import annotations

from dataclasses import dataclass

from .models import WorkerError, WorkerErrorType


UNSUPPORTED_RESTRICTED_VIDEO_MESSAGE = (
    "LectureMind supports public educational YouTube videos. This video appears "
    "to be private, restricted, age restricted, unavailable, or requires sign in. "
    "Please try a public video with captions, or a public lecture video that can "
    "be processed."
)

YOUTUBE_BLOCKED_AUTOMATION_MESSAGE = (
    "YouTube blocked automated access for this video. Try another public lecture "
    "or upload a file instead."
)


ERROR_COPY: dict[WorkerErrorType, tuple[str, str, bool]] = {
    "PRIVATE_VIDEO": (
        "This video is private.",
        UNSUPPORTED_RESTRICTED_VIDEO_MESSAGE,
        False,
    ),
    "MEMBERS_ONLY": (
        "This video is restricted.",
        UNSUPPORTED_RESTRICTED_VIDEO_MESSAGE,
        False,
    ),
    "LOGIN_REQUIRED": (
        "This video requires sign-in.",
        YOUTUBE_BLOCKED_AUTOMATION_MESSAGE,
        False,
    ),
    "VIDEO_UNAVAILABLE": (
        "This video is unavailable.",
        UNSUPPORTED_RESTRICTED_VIDEO_MESSAGE,
        False,
    ),
    "LIVE_STREAM_ACTIVE": (
        "Livestreams are not supported yet.",
        "Wait until the stream ends and YouTube finishes processing captions.",
        True,
    ),
    "AGE_RESTRICTED": (
        "This video requires sign-in.",
        UNSUPPORTED_RESTRICTED_VIDEO_MESSAGE,
        False,
    ),
    "REGION_BLOCKED": (
        "This video is not available in this region.",
        UNSUPPORTED_RESTRICTED_VIDEO_MESSAGE,
        False,
    ),
    "NO_CAPTIONS": (
        "No transcript is available yet.",
        "The video did not provide usable captions.",
        False,
    ),
    "TRANSCRIPT_UNAVAILABLE": (
        "No transcript is available yet.",
        "Captions were found, but they could not be read safely.",
        True,
    ),
    "AUDIO_EXTRACTION_FAILED": (
        "We could not extract audio from this video.",
        "Try another public lecture or a video with captions.",
        True,
    ),
    "TRANSCRIPTION_FAILED": (
        "Speech transcription failed.",
        "The video did not provide captions, and audio transcription could not complete.",
        True,
    ),
    "UNSUPPORTED_URL": (
        "That link is not a supported YouTube video.",
        "Paste a public YouTube watch, short, live, or youtu.be lecture link.",
        False,
    ),
    "VIDEO_TOO_LONG": (
        "This lecture is too long for this build.",
        "Try a lecture under 3 hours while we keep processing reliable.",
        False,
    ),
    "RATE_LIMITED": (
        "YouTube asked us to slow down.",
        "Please retry in a few minutes.",
        True,
    ),
    "NETWORK_ERROR": (
        "We could not reach YouTube.",
        "Check the URL or try again shortly.",
        True,
    ),
    "WORKER_UNAVAILABLE": (
        "Advanced processing is temporarily unavailable.",
        "Lecture captions may still work. Try again in a moment.",
        True,
    ),
    "UNKNOWN": (
        "We could not process this video.",
        "Try another public lecture URL. The failure was captured safely.",
        False,
    ),
}


@dataclass
class WorkerProcessingError(Exception):
    type: WorkerErrorType
    technical_message: str | None = None
    user_title: str | None = None
    user_message: str | None = None
    retryable: bool | None = None

    def __post_init__(self) -> None:
        title, message, retryable = ERROR_COPY[self.type]
        self.user_title = self.user_title or title
        self.user_message = self.user_message or message
        self.retryable = retryable if self.retryable is None else self.retryable
        super().__init__(self.technical_message or self.user_title)

    def to_public_error(self) -> WorkerError:
        return WorkerError(
            type=self.type,
            userTitle=self.user_title or ERROR_COPY[self.type][0],
            userMessage=self.user_message or ERROR_COPY[self.type][1],
            retryable=bool(self.retryable),
        )


def classify_ytdlp_error(error: Exception) -> WorkerProcessingError:
    message = str(error)
    normalized = message.lower()

    if "private" in normalized:
        return WorkerProcessingError("PRIVATE_VIDEO", message)
    if "members-only" in normalized or "members only" in normalized:
        return WorkerProcessingError("MEMBERS_ONLY", message)
    if "age" in normalized:
        return WorkerProcessingError("AGE_RESTRICTED", message)
    if "sign in" in normalized or "login" in normalized:
        return WorkerProcessingError("LOGIN_REQUIRED", message)
    if "country" in normalized or "region" in normalized or "blocked" in normalized:
        return WorkerProcessingError("REGION_BLOCKED", message)
    if "live event" in normalized or "live stream" in normalized or "premieres" in normalized:
        return WorkerProcessingError("LIVE_STREAM_ACTIVE", message)
    if "429" in normalized or "too many request" in normalized or "rate" in normalized:
        return WorkerProcessingError("RATE_LIMITED", message)
    if "unsupported url" in normalized or "not a valid url" in normalized:
        return WorkerProcessingError("UNSUPPORTED_URL", message)
    if (
        "unavailable" in normalized
        or "does not exist" in normalized
        or "doesn't exist" in normalized
        or "removed" in normalized
        or "deleted" in normalized
    ):
        return WorkerProcessingError("VIDEO_UNAVAILABLE", message)
    if "timed out" in normalized or "network" in normalized or "connection" in normalized:
        return WorkerProcessingError("NETWORK_ERROR", message)

    return WorkerProcessingError("UNKNOWN", message)
