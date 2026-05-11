from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

from .errors import WorkerProcessingError, classify_ytdlp_error
from .logging_config import log_event


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
    options = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "retries": 2,
        "socket_timeout": 30,
    }

    log_event(logger, "worker.audio.download.start", requestId=request_id)

    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            downloader.download([video_url])
    except Exception as error:  # yt-dlp raises a mix of custom exception types.
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
        raise WorkerProcessingError("AUDIO_EXTRACTION_FAILED", str(error)) from error

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
