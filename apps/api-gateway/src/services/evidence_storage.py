"""GCS evidence reader — wraps the synchronous storage client.

Read-only counterpart to `receipts_storage.ReceiptsUploader` for the
price-drop screenshots written by the monitor-agent's screenshot service
(ticket 4.12, `apps/monitor-agent/src/services/screenshot.py`). The
api-gateway never writes to the evidence bucket — `monitor_agent` has
the writer grant; api-gateway only reads via the
`api_gateway_evidence_reader` IAM binding in `infra/terraform/storage.tf`.

The `download` method backs the GET /api/v1/claims/:id/evidence proxy
endpoint added in ticket 5.8: authenticated users fetch their own
price-drop evidence through api-gateway rather than via a signed URL,
so the evidence bucket stays private
(public_access_prevention=enforced) and we never have to mint
signBlob credentials.

Bucket name comes from `EVIDENCE_BUCKET` env (resolved in Terraform
from `google_storage_bucket.evidence.name`). The matching `RECEIPTS_BUCKET`
pattern in `infra/terraform/main.tf` is the canonical model. Tests
override the reader dependency entirely and never reach this module.
"""

from __future__ import annotations

import asyncio
import logging
import os

from google.api_core import exceptions as gcs_exceptions
from google.cloud import storage

logger = logging.getLogger(__name__)


class EvidenceObjectMissingError(RuntimeError):
    """Raised when a referenced gs:// evidence blob doesn't exist."""


class EvidenceReader:
    """Download evidence screenshots from the configured GCS bucket."""

    def __init__(self, bucket_name: str | None = None) -> None:
        # Fail fast at startup if the bucket isn't configured — matches
        # how `ReceiptsUploader` already KeyErrors on RECEIPTS_BUCKET. A
        # misconfigured deployment crashes the container immediately
        # instead of 500-ing on the first evidence request.
        resolved = bucket_name or os.environ.get("EVIDENCE_BUCKET")
        if not resolved:
            raise RuntimeError("EVIDENCE_BUCKET environment variable is not configured")
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
        """Download an evidence object by path within the configured bucket.

        Returns `(data, content_type)`. Raises `EvidenceObjectMissingError`
        when the object is not found OR cannot be read due to GCS 403.
        The route maps that to a 404 so we don't leak "object exists but
        you can't read it" semantics across users.

        A 403 is logged at ERROR (with the blob path) BEFORE collapsing to
        `EvidenceObjectMissingError`. We never want an IAM regression
        (e.g. a stale Terraform apply that drops
        `api_gateway_evidence_reader`) to silently degrade to a generic
        404 in the logs — every Forbidden surfaces as a distinct line so
        an alert can fire even though the user-facing surface stays the
        same. Same operational stance as `ReceiptsUploader.download`.
        """
        return await asyncio.to_thread(self._download_sync, blob_path)

    def _download_sync(self, blob_path: str) -> tuple[bytes, str]:
        bucket = self._get_client().bucket(self._bucket_name)
        blob = bucket.blob(blob_path)
        try:
            data = blob.download_as_bytes()
        except gcs_exceptions.NotFound as err:
            raise EvidenceObjectMissingError(blob_path) from err
        except gcs_exceptions.Forbidden as err:
            logger.error(
                "GCS 403 on evidence blob — possible IAM regression: bucket=%s blob_path=%s err=%s",
                self._bucket_name,
                blob_path,
                err,
            )
            raise EvidenceObjectMissingError(blob_path) from err
        content_type = blob.content_type or "application/octet-stream"
        return data, content_type
