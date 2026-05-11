from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

from .errors import WorkerProcessingError, classify_ytdlp_error
from .logging_config import log_event
from .ytdlp_options import build_audio_options


def prepare_audio(
    video_url: str,
    workdir: Path,
    request_id: str,
    logger: logging.Logger,
) -> Path:
    if shutil.which("ffmpeg") is None:
        raise WorkerProcessingError(
            "AUDIO_EXTRACTION_FAILED",
            "ffmpeg was not found on PATH.",
            user_message="Audio extraction is not available in this environment yet.",
            retryable=True,
        )

    downloaded = download_audio(video_url, workdir, request_id, logger)
    wav_path = workdir / "speech.wav"
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(downloaded),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(wav_path),
    ]

    log_event(
        logger,
        "worker.audio.ffmpeg.start",
        requestId=request_id,
        input=str(downloaded.name),
    )

    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=1800,
        check=False,
    )

    if completed.returncode != 0 or not wav_path.exists():
        raise WorkerProcessingError(
            "AUDIO_EXTRACTION_FAILED",
            completed.stderr[-1000:] or "ffmpeg conversion failed.",
        )

    return wav_path


def download_audio(
    video_url: str,
    workdir: Path,
    request_id: str,
    logger: logging.Logger,
) -> Path:
    try:
        import yt_dlp
    except ImportError as error:
        raise WorkerProcessingError(
            "AUDIO_EXTRACTION_FAILED",
            "yt-dlp is not installed.",
            user_message="Audio extraction is not available in this environment yet.",
            retryable=True,
        ) from error

    output_template = str(workdir / "audio.%(ext)s")
    log_event(logger, "worker.audio.download.start", requestId=request_id)
    download_with_fallbacks(yt_dlp, video_url, output_template, workdir, request_id, logger)

    candidates = [
        path
        for path in workdir.glob("audio.*")
        if path.is_file() and not path.name.endswith(".part")
    ]

    if not candidates:
        raise WorkerProcessingError(
            "AUDIO_EXTRACTION_FAILED",
            "yt-dlp did not produce an audio file.",
        )

    return max(candidates, key=lambda path: path.stat().st_size)


def download_with_fallbacks(
    yt_dlp_module: object,
    video_url: str,
    output_template: str,
    workdir: Path,
    request_id: str,
    logger: logging.Logger,
) -> None:
    format_selectors = ["bestaudio/best", "best"]
    last_error: Exception | None = None

    for index, format_selector in enumerate(format_selectors):
        options = build_audio_options(
            output_template,
            format_selector=format_selector,
        )
        try:
            with yt_dlp_module.YoutubeDL(options) as downloader:  # type: ignore[attr-defined]
                downloader.download([video_url])
            return
        except Exception as error:  # yt-dlp raises a mix of custom exception types.
            last_error = error
            classified = classify_ytdlp_error(error)
            if classified.type in {
                "PRIVATE_VIDEO",
                "MEMBERS_ONLY",
                "LOGIN_REQUIRED",
                "VIDEO_UNAVAILABLE",
                "AGE_RESTRICTED",
                "REGION_BLOCKED",
            }:
                raise classified

            if index < len(format_selectors) - 1 and is_format_unavailable(error):
                remove_partial_audio_files(workdir)
                log_event(
                    logger,
                    "worker.audio.download.retry_format",
                    requestId=request_id,
                    formatSelector=format_selectors[index + 1],
                )
                continue

            break

    raise WorkerProcessingError(
        "AUDIO_EXTRACTION_FAILED",
        str(last_error) if last_error else "yt-dlp audio download failed.",
    )


def is_format_unavailable(error: Exception) -> bool:
    message = str(error).lower()
    return (
        "requested format is not available" in message
        or "no video formats found" in message
        or "no suitable formats" in message
    )


def remove_partial_audio_files(workdir: Path) -> None:
    for path in workdir.glob("audio.*"):
        if path.is_file():
            path.unlink(missing_ok=True)
