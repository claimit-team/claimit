"""GCS receipts uploader — wraps the synchronous storage client.

Mirrors `apps/monitor-agent/src/services/screenshot.py` for the upload
path. Upload is dispatched to a thread because google-cloud-storage's
client is sync. Bucket comes from `RECEIPTS_BUCKET` env var; tests
override the uploader dependency entirely and never reach this module.

The `download` method backs the GET /api/v1/purchases/:id/receipt proxy
endpoint (ticket 5.14): authenticated users fetch their own receipts
through api-gateway rather than via a signed URL, so the receipts bucket
stays private (public_access_prevention=enforced in terraform/storage.tf)
and we never have to mint signBlob credentials. Same Client instance is
reused for both directions.
"""

from __future__ import annotations

import asyncio
import logging
import os

from google.api_core import exceptions as gcs_exceptions
from google.cloud import storage

logger = logging.getLogger(__name__)


class ReceiptObjectMissingError(RuntimeError):
    """Raised when a referenced gs:// blob doesn't exist in the bucket."""


class ReceiptsUploader:
    """Upload + download receipts in the receipts GCS bucket."""

    def __init__(self, bucket_name: str | None = None) -> None:
        # Fail fast at startup if the bucket isn't configured — matches how
        # the api-gateway lifespan already KeyErrors on MONGODB_URI and
        # STATE_JWT_SECRET. A misconfigured deployment crashes the container
        # immediately instead of 500-ing on the first upload request.
        resolved = bucket_name or os.environ.get("RECEIPTS_BUCKET")
        if not resolved:
            raise RuntimeError("RECEIPTS_BUCKET environment variable is not configured")
        self._bucket_name: str = resolved
        self._client: storage.Client | None = None

    @property
    def bucket_name(self) -> str:
        return self._bucket_name

    def _get_client(self) -> storage.Client:
        if self._client is None:
            self._client = storage.Client()
        return self._client

    async def upload(self, *, data: bytes, content_type: str, blob_path: str) -> str:
        """Upload bytes and return the gs:// URI of the persisted object."""
        await asyncio.to_thread(self._upload_sync, data, content_type, blob_path)
        return f"gs://{self._bucket_name}/{blob_path}"

    def _upload_sync(self, data: bytes, content_type: str, blob_path: str) -> None:
        bucket = self._get_client().bucket(self._bucket_name)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(data, content_type=content_type)

    async def download(self, *, blob_path: str) -> tuple[bytes, str]:
        """Download an object by its path within the configured bucket.

        Returns `(data, content_type)`. Raises `ReceiptObjectMissingError`
        when the object is not found in GCS — the route maps that to a 404
        so we don't leak "object exists but you can't read it" semantics
        (storage.objectViewer is granted at the bucket level, so a missing
        object and an unauthorized one are distinguished by 404 vs 403 at
        the GCS layer; we collapse both to "missing" here on purpose).
        """
        return await asyncio.to_thread(self._download_sync, blob_path)

    def _download_sync(self, blob_path: str) -> tuple[bytes, str]:
        bucket = self._get_client().bucket(self._bucket_name)
        blob = bucket.blob(blob_path)
        try:
            data = blob.download_as_bytes()
        except gcs_exceptions.NotFound as err:
            raise ReceiptObjectMissingError(blob_path) from err
        # `download_as_bytes` populates blob metadata lazily — pull
        # content_type after the fetch so we report what GCS actually
        # stored (set on upload via `upload_from_string(content_type=...)`).
        content_type = blob.content_type or "application/octet-stream"
        return data, content_type
