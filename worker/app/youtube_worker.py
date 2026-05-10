from __future__ import annotations

import html
import logging
import re
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests

from .audio import prepare_audio
from .azure_speech import transcribe_audio
from .errors import WorkerProcessingError, classify_ytdlp_error
from .logging_config import log_event, now_ms
from .models import (
    ProcessYouTubeRequest,
    WorkerDiagnostics,
    WorkerMetadata,
    WorkerSegment,
    WorkerSuccessResponse,
)


YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
TIMESTAMP_RE = re.compile(
    r"(?P<start>(?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+"
    r"(?P<end>(?:\d{2}:)?\d{2}:\d{2}\.\d{3})"
)
TAG_RE = re.compile(r"<[^>]+>")


def process_youtube(
    payload: ProcessYouTubeRequest,
    request_id: str,
    logger: logging.Logger,
) -> WorkerSuccessResponse:
    started = now_ms()
    parsed_video_id = parse_youtube_video_id(payload.videoUrl)
    video_id = payload.videoId or parsed_video_id

    if parsed_video_id and video_id != parsed_video_id:
        raise WorkerProcessingError(
            "UNSUPPORTED_URL",
            f"Request videoId {video_id} did not match URL videoId {parsed_video_id}.",
        )

    if not YOUTUBE_ID_RE.match(video_id):
        raise WorkerProcessingError("UNSUPPORTED_URL", f"Invalid video ID: {video_id}")

    normalized_url = f"https://www.youtube.com/watch?v={video_id}"
    log_event(
        logger,
        "worker.youtube.metadata.start",
        requestId=request_id,
        notebookId=payload.notebookId,
        videoId=video_id,
    )
    info = extract_metadata(normalized_url)
    metadata = to_metadata(info, video_id, normalized_url)

    if metadata.isLive:
        raise WorkerProcessingError(
            "LIVE_STREAM_ACTIVE",
            f"yt-dlp reported an active live video: {video_id}",
        )

    if metadata.durationSec and metadata.durationSec > payload.maxDurationSeconds:
        raise WorkerProcessingError(
            "VIDEO_TOO_LONG",
            f"Duration {metadata.durationSec}s exceeds {payload.maxDurationSeconds}s.",
        )

    if int(info.get("age_limit") or 0) >= 18:
        raise WorkerProcessingError(
            "AGE_RESTRICTED",
            f"yt-dlp reported age_limit={info.get('age_limit')}.",
        )

    captions = extract_caption_segments(
        info=info,
        preferred_language=payload.preferredLanguage,
        request_id=request_id,
        logger=logger,
    )

    if captions:
        diagnostics = WorkerDiagnostics(
            engine="yt-dlp",
            captionTrackFound=True,
            asrUsed=False,
            segmentCount=len(captions),
            requestId=request_id,
            details={
                "durationMs": now_ms() - started,
                "captionLanguages": sorted((info.get("subtitles") or {}).keys()),
                "autoCaptionLanguages": sorted(
                    (info.get("automatic_captions") or {}).keys()
                ),
            },
        )
        return WorkerSuccessResponse(
            metadata=metadata,
            segments=captions,
            diagnostics=diagnostics,
        )

    if not payload.allowAsrFallback:
        raise WorkerProcessingError(
            "NO_CAPTIONS",
            "No usable manual or automatic caption track was found.",
        )

    log_event(
        logger,
        "worker.youtube.asr.start",
        requestId=request_id,
        notebookId=payload.notebookId,
        videoId=video_id,
    )

    with tempfile.TemporaryDirectory(prefix="lecturemind-worker-") as temp_dir:
        audio_path = prepare_audio(
            normalized_url,
            Path(temp_dir),
            request_id,
            logger,
        )
        asr_segments = transcribe_audio(
            audio_path,
            payload.preferredLanguage,
            payload.maxDurationSeconds,
        )

    diagnostics = WorkerDiagnostics(
        engine="yt-dlp",
        captionTrackFound=False,
        asrUsed=True,
        segmentCount=len(asr_segments),
        requestId=request_id,
        details={"durationMs": now_ms() - started},
    )
    return WorkerSuccessResponse(
        metadata=metadata,
        segments=asr_segments,
        diagnostics=diagnostics,
    )


def extract_metadata(normalized_url: str) -> dict[str, Any]:
    try:
        import yt_dlp
    except ImportError as error:
        raise WorkerProcessingError(
            "WORKER_UNAVAILABLE",
            "yt-dlp is not installed in the worker environment.",
        ) from error

    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 2,
    }

    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            return downloader.extract_info(normalized_url, download=False)
    except Exception as error:
        raise classify_ytdlp_error(error) from error


def to_metadata(
    info: dict[str, Any],
    fallback_video_id: str,
    normalized_url: str,
) -> WorkerMetadata:
    video_id = str(info.get("id") or fallback_video_id)
    duration = info.get("duration")
    duration_sec = int(duration) if isinstance(duration, (int, float)) else None
    live_status = str(info.get("live_status") or "").lower()
    is_live = bool(info.get("is_live")) or live_status in {
        "is_live",
        "is_upcoming",
    }

    return WorkerMetadata(
        videoId=video_id,
        title=str(info.get("title") or f"YouTube lecture {video_id}"),
        author=info.get("uploader") or info.get("channel"),
        thumbnailUrl=info.get("thumbnail"),
        durationSec=duration_sec,
        isLive=is_live,
        normalizedUrl=normalized_url,
    )


def extract_caption_segments(
    info: dict[str, Any],
    preferred_language: str,
    request_id: str,
    logger: logging.Logger,
) -> list[WorkerSegment]:
    tracks = choose_caption_tracks(info, preferred_language)

    for track in tracks:
        log_event(
            logger,
            "worker.youtube.caption.try",
            requestId=request_id,
            language=track["language"],
            source=track["rawSource"],
            ext=track["format"].get("ext"),
        )
        try:
            text = fetch_subtitle_text(track["format"])
            segments = parse_subtitle_text(
                text=text,
                language=track["language"],
                source_type=track["sourceType"],
                extraction_engine=track["extractionEngine"],
                raw_source=track["rawSource"],
            )
            if segments:
                return segments
        except WorkerProcessingError:
            raise
        except Exception as error:
            log_event(
                logger,
                "worker.youtube.caption.failed",
                requestId=request_id,
                language=track["language"],
                error=str(error),
            )

    return []


def choose_caption_tracks(
    info: dict[str, Any],
    preferred_language: str,
) -> list[dict[str, Any]]:
    manual = info.get("subtitles") or {}
    automatic = info.get("automatic_captions") or {}
    preferred = normalize_language(preferred_language)
    ordered: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    def add_tracks(
        collection: dict[str, list[dict[str, Any]]],
        language: str | None,
        source_type: str,
        extraction_engine: str,
        raw_source: str,
    ) -> None:
        languages = [language] if language else sorted(collection.keys())
        for lang in languages:
            if not lang:
                continue
            formats = collection.get(lang)
            if not formats:
                matching_key = find_language_key(collection, lang)
                formats = collection.get(matching_key) if matching_key else None
                lang = matching_key or lang
            if not formats:
                continue
            selected_format = choose_subtitle_format(formats)
            if not selected_format:
                continue
            key = (lang, raw_source, selected_format.get("url", ""))
            if key in seen:
                continue
            seen.add(key)
            ordered.append(
                {
                    "language": lang,
                    "format": selected_format,
                    "sourceType": source_type,
                    "extractionEngine": extraction_engine,
                    "rawSource": raw_source,
                }
            )

    add_tracks(manual, "en", "CAPTION", "yt-dlp-caption", "manual-caption")
    if preferred != "en":
        add_tracks(manual, preferred, "CAPTION", "yt-dlp-caption", "manual-caption")
    add_tracks(automatic, "en", "AUTO_CAPTION", "yt-dlp-auto-caption", "auto-caption")
    if preferred != "en":
        add_tracks(
            automatic,
            preferred,
            "AUTO_CAPTION",
            "yt-dlp-auto-caption",
            "auto-caption",
        )
    add_tracks(manual, None, "CAPTION", "yt-dlp-caption", "manual-caption")
    add_tracks(
        automatic,
        None,
        "AUTO_CAPTION",
        "yt-dlp-auto-caption",
        "auto-caption",
    )

    return ordered


def normalize_language(language: str) -> str:
    value = (language or "en").strip().lower()
    return value.split("-")[0] if value else "en"


def find_language_key(
    collection: dict[str, list[dict[str, Any]]],
    desired: str,
) -> str | None:
    normalized = normalize_language(desired)
    for key in collection:
        if key.lower() == desired.lower() or normalize_language(key) == normalized:
            return key
    return None


def choose_subtitle_format(formats: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not formats:
        return None
    for ext in ("vtt", "json3", "srv3", "ttml"):
        for item in formats:
            if item.get("url") and str(item.get("ext", "")).lower() == ext:
                return item
    return next((item for item in formats if item.get("url")), None)


def fetch_subtitle_text(track_format: dict[str, Any]) -> str:
    url = track_format.get("url")
    if not url:
        raise WorkerProcessingError(
            "TRANSCRIPT_UNAVAILABLE",
            "Subtitle format did not include a URL.",
        )

    response = requests.get(str(url), timeout=30)
    if response.status_code == 429:
        raise WorkerProcessingError(
            "RATE_LIMITED",
            "Subtitle request returned HTTP 429.",
        )
    if not response.ok:
        raise WorkerProcessingError(
            "TRANSCRIPT_UNAVAILABLE",
            f"Subtitle request returned HTTP {response.status_code}.",
        )
    return response.text


def parse_subtitle_text(
    text: str,
    language: str,
    source_type: str,
    extraction_engine: str,
    raw_source: str,
) -> list[WorkerSegment]:
    stripped = text.lstrip()
    if stripped.startswith("{"):
        segments = parse_json3(
            stripped,
            language,
            source_type,
            extraction_engine,
            raw_source,
        )
    else:
        segments = parse_vtt(
            stripped,
            language,
            source_type,
            extraction_engine,
            raw_source,
        )

    return merge_tiny_segments(segments)


def parse_vtt(
    text: str,
    language: str,
    source_type: str,
    extraction_engine: str,
    raw_source: str,
) -> list[WorkerSegment]:
    lines = text.replace("\ufeff", "").splitlines()
    segments: list[WorkerSegment] = []
    index = 0

    while index < len(lines):
        line = lines[index].strip()

        if not line or line == "WEBVTT" or line.startswith(("Kind:", "Language:")):
            index += 1
            continue

        if line.startswith(("NOTE", "STYLE", "REGION")):
            index += 1
            while index < len(lines) and lines[index].strip():
                index += 1
            continue

        match = TIMESTAMP_RE.search(line)
        if not match:
            index += 1
            continue

        start_sec = parse_vtt_timestamp(match.group("start"))
        end_sec = parse_vtt_timestamp(match.group("end"))
        index += 1
        text_lines: list[str] = []

        while index < len(lines):
            next_line = lines[index].strip()
            if not next_line:
                break
            if TIMESTAMP_RE.search(next_line):
                index -= 1
                break
            text_lines.append(next_line)
            index += 1

        cleaned = clean_caption_text(" ".join(text_lines))
        if cleaned and end_sec > start_sec:
            segments.append(
                WorkerSegment(
                    startSec=start_sec,
                    endSec=end_sec,
                    text=cleaned,
                    sourceType=source_type,  # type: ignore[arg-type]
                    confidence=1.0 if source_type == "CAPTION" else 0.82,
                    language=language,
                    extractionEngine=extraction_engine,  # type: ignore[arg-type]
                    rawSource=raw_source,  # type: ignore[arg-type]
                )
            )

        index += 1

    return segments


def parse_json3(
    text: str,
    language: str,
    source_type: str,
    extraction_engine: str,
    raw_source: str,
) -> list[WorkerSegment]:
    import json

    payload = json.loads(text)
    segments: list[WorkerSegment] = []

    for event in payload.get("events", []):
        text_value = clean_caption_text(
            "".join(segment.get("utf8", "") for segment in event.get("segs", []))
        )
        if not text_value:
            continue

        start_sec = float(event.get("tStartMs", 0)) / 1000
        duration_sec = max(float(event.get("dDurationMs", 0)) / 1000, 0.5)
        segments.append(
            WorkerSegment(
                startSec=start_sec,
                endSec=start_sec + duration_sec,
                text=text_value,
                sourceType=source_type,  # type: ignore[arg-type]
                confidence=1.0 if source_type == "CAPTION" else 0.82,
                language=language,
                extractionEngine=extraction_engine,  # type: ignore[arg-type]
                rawSource=raw_source,  # type: ignore[arg-type]
            )
        )

    return segments


def merge_tiny_segments(segments: list[WorkerSegment]) -> list[WorkerSegment]:
    merged: list[WorkerSegment] = []

    for segment in segments:
        previous = merged[-1] if merged else None
        gap = segment.startSec - previous.endSec if previous else 999
        should_merge = (
            previous is not None
            and previous.sourceType == segment.sourceType
            and previous.rawSource == segment.rawSource
            and len(previous.text) < 48
            and len(segment.text) < 72
            and 0 <= gap <= 1.25
        )

        if should_merge and previous is not None:
            previous.endSec = max(previous.endSec, segment.endSec)
            previous.text = clean_caption_text(f"{previous.text} {segment.text}")
            previous.confidence = min(previous.confidence, segment.confidence)
        else:
            merged.append(segment)

    return merged


def parse_youtube_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    path_parts = [part for part in parsed.path.split("/") if part]

    if host == "youtu.be" and path_parts:
        return path_parts[0]

    if "youtube.com" in host:
        if parsed.path == "/watch":
            values = parse_qs(parsed.query).get("v")
            return values[0] if values else None
        if path_parts and path_parts[0] in {"shorts", "live", "embed"} and len(path_parts) > 1:
            return path_parts[1]

    return None


def parse_vtt_timestamp(value: str) -> float:
    parts = value.split(":")
    seconds = float(parts[-1])
    minutes = int(parts[-2])
    hours = int(parts[-3]) if len(parts) == 3 else 0
    return hours * 3600 + minutes * 60 + seconds


def clean_caption_text(value: str) -> str:
    text = TAG_RE.sub("", value)
    text = html.unescape(text)
    text = re.sub(r"[\u200B-\u200D\uFEFF]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
