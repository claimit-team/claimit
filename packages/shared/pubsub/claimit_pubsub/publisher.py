"""Async helper for publishing typed events to Google Cloud Pub/Sub.

Construct a singleton `PublisherClient` lazily so import-time has no GCP side
effects, and wrap the blocking `publish()` call in a thread executor so
callers can `await` it from FastAPI handlers.

Project resolution order:
1. `GCP_PROJECT_ID` env var (preferred — set on Cloud Run).
2. Application Default Credentials via `google.auth.default()`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from typing import TYPE_CHECKING

from google.cloud import pubsub_v1

from .events import EventEnvelope

if TYPE_CHECKING:  # pragma: no cover
    from google.cloud.pubsub_v1 import PublisherClient

logger = logging.getLogger(__name__)

PUBLISH_TIMEOUT_SECONDS = 30.0

_client: PublisherClient | None = None
_client_lock = threading.Lock()
_project_id: str | None = None


def _get_publisher() -> PublisherClient:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = pubsub_v1.PublisherClient()
    return _client


def _get_project_id() -> str:
    global _project_id
    if _project_id:
        return _project_id

    env_project = os.environ.get("GCP_PROJECT_ID")
    if env_project:
        _project_id = env_project
        return _project_id

    import google.auth

    _, project = google.auth.default()
    if not project:
        raise RuntimeError("Could not resolve GCP project. Set GCP_PROJECT_ID or configure ADC.")
    _project_id = project
    return _project_id


async def publish_event(topic: str, event: EventEnvelope) -> str:
    """Publish a typed event to `topic`. Returns the Pub/Sub message id.

    The event is JSON-serialized; `event_id`, `schema_version`, and
    `event_type` are also attached as Pub/Sub attributes so subscribers can
    filter or dedupe without parsing the body.
    """
    project_id = _get_project_id()
    topic_path = _get_publisher().topic_path(project_id, topic)

    data = event.model_dump_json().encode("utf-8")
    attributes = {
        "event_id": event.event_id,
        "schema_version": str(event.schema_version),
        "event_type": type(event).__name__,
    }

    loop = asyncio.get_running_loop()
    future = _get_publisher().publish(topic_path, data, **attributes)
    message_id = await loop.run_in_executor(
        None,
        lambda: future.result(timeout=PUBLISH_TIMEOUT_SECONDS),
    )
    logger.info(
        "Published %s event_id=%s topic=%s message_id=%s",
        type(event).__name__,
        event.event_id,
        topic,
        message_id,
    )
    return message_id


def _reset_for_tests() -> None:
    """Reset module-level singletons. Test-only helper."""
    global _client, _project_id
    _client = None
    _project_id = None
