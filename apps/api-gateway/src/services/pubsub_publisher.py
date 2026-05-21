"""Pub/Sub publisher wrapper.

Thin async-friendly facade over google.cloud.pubsub_v1.PublisherClient.
Initialized once in lifespan() and shared via deps.get_pubsub_publisher().

The underlying client is gRPC; its publish() returns a concurrent.futures.Future
whose .result() blocks. We wrap that call in asyncio.to_thread so the event
loop is not pinned while we wait for the broker ack. Timeout is bounded so a
broker hang does not stall a request indefinitely.

Project ID resolution (post-5.14 prod-verification fix):
  1. `GOOGLE_CLOUD_PROJECT` env var (historical name this publisher checked).
  2. `GCP_PROJECT_ID` env var (the name Terraform already sets on both
     api-gateway and ingest-agent — matches what `claimit_pubsub` uses).
  3. `google.auth.default()` ambient project (Cloud Run / ADC fallback).

Resolution is lazy + cached: the lookup happens on first `publish()`, not at
import. This keeps tests that don't touch publish() free of GCP env coupling
while still failing loud the FIRST time a real upload (or claim approve) tries
to fan out an event with no project resolvable.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

from google.cloud import pubsub_v1

logger = logging.getLogger(__name__)

_PUBLISH_TIMEOUT_SECONDS = 10.0

_project_id_cache: str | None = None


def _resolve_project_id() -> str:
    """Resolve and cache the GCP project ID. Raises if all three paths fail.

    Cached because every publish() call hits this; ADC's `google.auth.default()`
    is itself cached upstream but the env lookup + caching here keeps the hot
    path branch-free after the first call.
    """
    global _project_id_cache
    if _project_id_cache:
        return _project_id_cache

    env_project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT_ID")
    if env_project:
        _project_id_cache = env_project
        return _project_id_cache

    # Local import: google.auth pulls in a non-trivial dependency graph and
    # we want module import to stay cheap for tests that never publish.
    import google.auth

    _, ambient = google.auth.default()
    if ambient:
        logger.info(
            "GCP project resolved via google.auth.default() (no env var set): %s",
            ambient,
        )
        _project_id_cache = ambient
        return _project_id_cache

    raise RuntimeError(
        "GCP project ID is not configured. Set GOOGLE_CLOUD_PROJECT or "
        "GCP_PROJECT_ID, or run with Application Default Credentials."
    )


class PubSubPublisher:
    def __init__(self) -> None:
        self.client = pubsub_v1.PublisherClient()

    async def publish(self, topic_name: str, data: dict) -> str:
        """Publish a JSON-encoded message. Returns the broker-assigned message ID.

        Awaits broker ack with a 10-second cap; durable on success. Caller is
        responsible for catching exceptions if the publish must not fail the
        request — by default an unawaitable Future error or timeout propagates.
        """
        project_id = _resolve_project_id()
        topic_path = self.client.topic_path(project_id, topic_name)
        message_bytes = json.dumps(data).encode("utf-8")
        future = self.client.publish(topic_path, message_bytes)
        message_id = await asyncio.to_thread(future.result, timeout=_PUBLISH_TIMEOUT_SECONDS)
        logger.info("Published to %s: message_id=%s", topic_name, message_id)
        return message_id
