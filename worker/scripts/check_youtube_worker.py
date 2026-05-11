from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlparse


def main() -> int:
    parser = argparse.ArgumentParser(description="Check LectureMind worker YouTube processing.")
    parser.add_argument("url_or_id", help="Public YouTube URL or 11 character video ID.")
    parser.add_argument("--worker-url", default="http://127.0.0.1:8000")
    parser.add_argument("--notebook-id", default="worker-self-test")
    parser.add_argument("--language", default="en")
    args = parser.parse_args()

    video_id = extract_video_id(args.url_or_id)
    video_url = (
        args.url_or_id
        if args.url_or_id.startswith(("http://", "https://"))
        else f"https://www.youtube.com/watch?v={video_id}"
    )
    payload = {
        "notebookId": args.notebook_id,
        "videoUrl": video_url,
        "videoId": video_id,
        "preferredLanguage": args.language,
        "allowAsrFallback": True,
        "maxDurationSeconds": 10800,
    }
    request = urllib.request.Request(
        f"{args.worker_url.rstrip('/')}/process-youtube",
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=1800) as response:
            status_code = response.status
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        status_code = error.code
        body = json.loads(error.read().decode("utf-8"))

    diagnostics = body.get("diagnostics") or {}
    segments = body.get("segments") or []
    error = body.get("error") or {}

    print(f"httpStatus={status_code}")
    print(f"status={body.get('status', 'UNKNOWN')}")
    print(f"ok={body.get('status') == 'READY'}")
    print(f"errorType={error.get('type', '')}")
    print(f"segmentCount={len(segments)}")
    print(f"asrUsed={bool(diagnostics.get('asrUsed'))}")

    return 0 if status_code == 200 else 1


def extract_video_id(value: str) -> str:
    if len(value) == 11 and "/" not in value and "?" not in value:
        return value

    parsed = urlparse(value)
    if parsed.hostname == "youtu.be":
        return parsed.path.strip("/").split("/")[0]

    if parsed.hostname and "youtube.com" in parsed.hostname:
        if parsed.path == "/watch":
            video_ids = parse_qs(parsed.query).get("v")
            if video_ids:
                return video_ids[0]
        parts = [part for part in parsed.path.split("/") if part]
        if parts and parts[0] in {"shorts", "live", "embed"} and len(parts) > 1:
            return parts[1]

    raise SystemExit("Could not extract an 11 character YouTube video ID.")


if __name__ == "__main__":
    sys.exit(main())
