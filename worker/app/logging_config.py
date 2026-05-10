from __future__ import annotations

import json
import logging
import time
from typing import Any


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def now_ms() -> int:
    return int(time.time() * 1000)


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    logger.info(json.dumps(payload, default=str, sort_keys=True))
