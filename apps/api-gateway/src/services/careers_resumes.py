"""GCS uploader for careers interest-form resume attachments."""

from __future__ import annotations

import asyncio
import logging
import os
import re

from google.cloud import storage

logger = logging.getLogger(__name__)

MAX_RESUME_BYTES = 5 * 1024 * 1024

ALLOWED_RESUME_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
)

_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


class CareersResumesUploader:
    """Upload career interest resumes to the dedicated GCS bucket."""

    def __init__(self, bucket_name: str | None = None) -> None:
        resolved = bucket_name or os.environ.get("CAREERS_RESUMES_BUCKET")
        if not resolved:
            raise RuntimeError("CAREERS_RESUMES_BUCKET environment variable is not configured")
        self._bucket_name: str = resolved
        self._client: storage.Client | None = None

    @property
    def bucket_name(self) -> str:
        return self._bucket_name

    def _get_client(self) -> storage.Client:
        if self._client is None:
            self._client = storage.Client()
        return self._client

    async def upload(
        self,
        *,
        submission_id: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> str:
        """Upload resume bytes and return the gs:// URI."""
        blob_path = self.build_blob_path(submission_id=submission_id, filename=filename)
        await asyncio.to_thread(
            self._upload_sync,
            content,
            content_type,
            blob_path,
        )
        return f"gs://{self._bucket_name}/{blob_path}"

    def _upload_sync(self, data: bytes, content_type: str, blob_path: str) -> None:
        bucket = self._get_client().bucket(self._bucket_name)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(data, content_type=content_type)
        logger.info(
            "Careers resume uploaded bucket=%s blob_path=%s bytes=%d",
            self._bucket_name,
            blob_path,
            len(data),
        )

    @staticmethod
    def build_blob_path(*, submission_id: str, filename: str) -> str:
        safe_name = sanitize_filename(filename)
        return f"careers-resumes/{submission_id}/{safe_name}"


def sanitize_filename(name: str) -> str:
    """Sanitize an upload filename — same spirit as purchases receipt paths."""
    safe = _FILENAME_SAFE.sub("_", name.strip())
    return (safe[:200] or "resume").lstrip(".")
