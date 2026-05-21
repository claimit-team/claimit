"""GCS receipts reader (ingest-agent side, ticket 5.14).

Counterpart to api-gateway's `ReceiptsUploader.download`. ingest-agent
holds `roles/storage.objectViewer` on the receipts bucket (granted via
`ingest_agent_receipts_reader` in terraform/storage.tf) so the Pub/Sub
push handler can fetch the uploaded blob and feed it to Gemini.

Bucket discovery follows the same convention as the api-gateway
uploader: explicit `bucket_name` arg wins, else `RECEIPTS_BUCKET` env
var. Fail-fast in __init__ so a misconfigured Cloud Run revision
crashes the container at startup rather than 500-ing on the first
inbound Pub/Sub push.
"""

from __future__ import annotations

import asyncio
import logging
import os

from google.api_core import exceptions as gcs_exceptions
from google.cloud import storage

logger = logging.getLogger(__name__)


class ReceiptObjectMissingError(RuntimeError):
    """Raised when a referenced gs:// blob isn't present in the bucket."""


class ReceiptsReader:
    """Read receipt blobs out of the configured GCS bucket."""

    def __init__(self, bucket_name: str | None = None) -> None:
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

    async def download(self, *, blob_path: str) -> tuple[bytes, str]:
        """Fetch `(data, content_type)` for a blob path within the bucket.

        Raises `ReceiptObjectMissingError` when the blob is absent (GCS
        404) OR when it can't be read because of GCS 403 — the handler
        ack-and-logs in both cases. A 403 is logged at ERROR with bucket
        + path BEFORE the collapse so an IAM regression on
        `ingest_agent_receipts_reader` doesn't silently masquerade as a
        normal "missing object" line.
        """
        return await asyncio.to_thread(self._download_sync, blob_path)

    def _download_sync(self, blob_path: str) -> tuple[bytes, str]:
        bucket = self._get_client().bucket(self._bucket_name)
        blob = bucket.blob(blob_path)
        try:
            data = blob.download_as_bytes()
        except gcs_exceptions.NotFound as err:
            raise ReceiptObjectMissingError(blob_path) from err
        except gcs_exceptions.Forbidden as err:
            logger.error(
                "GCS 403 on receipt blob — possible IAM regression: bucket=%s blob_path=%s err=%s",
                self._bucket_name,
                blob_path,
                err,
            )
            raise ReceiptObjectMissingError(blob_path) from err
        content_type = blob.content_type or "application/octet-stream"
        return data, content_type


def parse_gs_uri(uri: str) -> tuple[str, str]:
    """Split `gs://bucket/path/with/slashes` into `(bucket, path)`.

    Raises `ValueError` for any malformed input. Same surface as
    api-gateway's `services.purchases._parse_gs_uri`; kept here as a
    free function rather than imported to keep the ingest-agent free of
    api-gateway dependencies (the two services do not share a runtime
    import graph in production).
    """
    if not uri.startswith("gs://"):
        raise ValueError(f"Not a gs:// URI: {uri!r}")
    remainder = uri[len("gs://") :]
    bucket, sep, path = remainder.partition("/")
    if not bucket or not sep or not path:
        raise ValueError(f"Malformed gs:// URI (missing bucket or path): {uri!r}")
    return bucket, path
