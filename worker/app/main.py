from __future__ import annotations

import logging
import os
import uuid
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

from .errors import WorkerProcessingError
from .logging_config import configure_logging, log_event
from .models import (
    ProcessYouTubeRequest,
    WorkerDiagnostics,
    WorkerFailureResponse,
)
from .youtube_worker import process_youtube
from .ytdlp_options import get_ytdlp_cookie_diagnostics


load_dotenv()
configure_logging()

logger = logging.getLogger("lecturemind.worker")
app = FastAPI(title="LectureMind Worker", version="phase-3")


@app.on_event("startup")
def log_worker_config() -> None:
    log_event(
        logger,
        "worker.config",
        **get_ytdlp_cookie_diagnostics(),
        azureSpeechConfigured=bool(
            os.getenv("AZURE_SPEECH_KEY", "").strip()
            and os.getenv("AZURE_SPEECH_REGION", "").strip()
        ),
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "lecturemind-worker",
        "version": "phase-3",
    }


@app.post("/process-youtube")
def process_youtube_endpoint(
    payload: ProcessYouTubeRequest,
    request: Request,
    x_lecturemind_worker_secret: str | None = Header(default=None),
) -> JSONResponse:
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    configured_secret = os.getenv("WORKER_SHARED_SECRET", "").strip()

    if configured_secret and x_lecturemind_worker_secret != configured_secret:
        log_event(
            logger,
            "worker.auth.failed",
            requestId=request_id,
            notebookId=payload.notebookId,
            videoId=payload.videoId,
        )
        failure = WorkerFailureResponse(
            error=WorkerProcessingError(
                "WORKER_UNAVAILABLE",
                "Worker shared secret validation failed.",
            ).to_public_error(),
            diagnostics=WorkerDiagnostics(
                engine="yt-dlp",
                requestId=request_id,
                details={"auth": "failed"},
            ),
        )
        return JSONResponse(model_to_dict(failure), status_code=200)

    log_event(
        logger,
        "worker.process.start",
        requestId=request_id,
        notebookId=payload.notebookId,
        videoId=payload.videoId,
        preferredLanguage=payload.preferredLanguage,
        allowAsrFallback=payload.allowAsrFallback,
    )

    try:
        result = process_youtube(payload, request_id, logger)
        log_event(
            logger,
            "worker.process.ready",
            requestId=request_id,
            notebookId=payload.notebookId,
            videoId=result.metadata.videoId,
            asrUsed=result.diagnostics.asrUsed,
            segmentCount=len(result.segments),
        )
        return JSONResponse(model_to_dict(result), status_code=200)
    except WorkerProcessingError as error:
        log_event(
            logger,
            "worker.process.failed",
            requestId=request_id,
            notebookId=payload.notebookId,
            videoId=payload.videoId,
            errorType=error.type,
            technicalMessage=error.technical_message,
        )
        failure = WorkerFailureResponse(
            error=error.to_public_error(),
            diagnostics=WorkerDiagnostics(
                engine="yt-dlp",
                requestId=request_id,
                asrUsed=error.type == "TRANSCRIPTION_FAILED",
                details={"technicalMessage": error.technical_message},
            ),
        )
        return JSONResponse(model_to_dict(failure), status_code=200)
    except Exception as error:
        safe_error = WorkerProcessingError("UNKNOWN", str(error))
        log_event(
            logger,
            "worker.process.failed",
            requestId=request_id,
            notebookId=payload.notebookId,
            videoId=payload.videoId,
            errorType=safe_error.type,
            technicalMessage=safe_error.technical_message,
        )
        failure = WorkerFailureResponse(
            error=safe_error.to_public_error(),
            diagnostics=WorkerDiagnostics(
                engine="yt-dlp",
                requestId=request_id,
                details={"technicalMessage": safe_error.technical_message},
            ),
        )
        return JSONResponse(model_to_dict(failure), status_code=200)


def model_to_dict(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()
