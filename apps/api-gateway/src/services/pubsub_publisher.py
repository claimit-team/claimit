"""Pub/Sub publisher wrapper.

Thin async-friendly facade over google.cloud.pubsub_v1.PublisherClient.
Initialized once in lifespan() and shared via deps.get_pubsub_publisher().

The underlying client is gRPC; its publish() returns a concurrent.futures.Future
whose .result() blocks. We wrap that call in asyncio.to_thread so the event
loop is not pinned while we wait for the broker ack. Timeout is bounded so a
broker hang does not stall a request indefinitely.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

from google.cloud import pubsub_v1

logger = logging.getLogger(__name__)

_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "claimit-beta")
_PUBLISH_TIMEOUT_SECONDS = 10.0


class PubSubPublisher:
    def __init__(self) -> None:
        self.client = pubsub_v1.PublisherClient()

    async def publish(self, topic_name: str, data: dict) -> str:
        """Publish a JSON-encoded message. Returns the broker-assigned message ID.

        Awaits broker ack with a 10-second cap; durable on success. Caller is
        responsible for catching exceptions if the publish must not fail the
        request — by default an unawaitable Future error or timeout propagates.
        """
        topic_path = self.client.topic_path(_PROJECT_ID, topic_name)
        message_bytes = json.dumps(data).encode("utf-8")
        future = self.client.publish(topic_path, message_bytes)
        message_id = await asyncio.to_thread(future.result, timeout=_PUBLISH_TIMEOUT_SECONDS)
        logger.info("Published to %s: message_id=%s", topic_name, message_id)
        return message_id
