"""GCS receipts uploader — wraps the synchronous storage client.

Mirrors `apps/monitor-agent/src/services/screenshot.py` for the upload
path. Upload is dispatched to a thread because google-cloud-storage's
client is sync. Bucket comes from `RECEIPTS_BUCKET` env var; tests
override the uploader dependency entirely and never reach this module.
"""

from __future__ import annotations

import asyncio
import logging
import os

from google.cloud import storage

logger = logging.getLogger(__name__)


class ReceiptsUploader:
    """Upload a receipt file to the receipts GCS bucket."""

    def __init__(self, bucket_name: str | None = None) -> None:
        self._bucket_name = bucket_name or os.environ.get("RECEIPTS_BUCKET")
        self._client: storage.Client | None = None

    def _get_client(self) -> storage.Client:
        if self._client is None:
            self._client = storage.Client()
        return self._client

    async def upload(self, *, data: bytes, content_type: str, blob_path: str) -> str:
        """Upload bytes and return the gs:// URI of the persisted object."""
        if not self._bucket_name:
            raise RuntimeError("RECEIPTS_BUCKET environment variable is not configured")
        bucket_name = self._bucket_name
        await asyncio.to_thread(self._upload_sync, data, content_type, blob_path)
        return f"gs://{bucket_name}/{blob_path}"

    def _upload_sync(self, data: bytes, content_type: str, blob_path: str) -> None:
        bucket = self._get_client().bucket(self._bucket_name)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(data, content_type=content_type)
