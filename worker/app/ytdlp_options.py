from __future__ import annotations

import os
from pathlib import Path
from typing import Any


def get_ytdlp_cookiefile() -> str | None:
    value = os.getenv("YOUTUBE_COOKIES_FILE", "").strip()
    if not value:
        return None

    path = Path(value).expanduser()
    if not path.is_file() or not os.access(path, os.R_OK):
        return None

    return str(path)


def get_ytdlp_cookie_diagnostics() -> dict[str, bool]:
    value = os.getenv("YOUTUBE_COOKIES_FILE", "").strip()
    path = Path(value).expanduser() if value else None
    exists = bool(path and path.is_file())

    return {
        "cookiesConfigured": bool(value),
        "cookieFileExists": exists,
        "cookieFileReadable": bool(path and exists and os.access(path, os.R_OK)),
    }


def build_metadata_options() -> dict[str, Any]:
    return with_cookiefile(
        {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "retries": 2,
        }
    )


def build_audio_options(
    output_template: str,
    *,
    format_selector: str = "bestaudio/best",
) -> dict[str, Any]:
    return with_cookiefile(
        {
            "format": format_selector,
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "retries": 2,
            "socket_timeout": 30,
        }
    )


def with_cookiefile(options: dict[str, Any]) -> dict[str, Any]:
    cookiefile = get_ytdlp_cookiefile()
    if cookiefile:
        return {
            **options,
            "cookiefile": cookiefile,
        }

    return options
