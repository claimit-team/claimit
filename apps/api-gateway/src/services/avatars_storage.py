"""GCS storage helper for user avatar uploads.

The avatars bucket is configured with public read (allUsers /
objectViewer) at the IAM level, so blob URLs returned here are
directly browser-loadable without signed URLs.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Final

from google.cloud import storage

logger = logging.getLogger(__name__)

ALLOWED_AVATAR_TYPES: Final[dict[str, str]] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

MAX_AVATAR_BYTES: Final[int] = 2 * 1024 * 1024  # 2 MB


class AvatarsUploader:
    def __init__(self, bucket_name: str | None = None) -> None:
        resolved = bucket_name or os.environ.get("AVATARS_BUCKET")
        if not resolved:
            raise RuntimeError("AVATARS_BUCKET environment variable is not configured")
        self._bucket_name = resolved
        self._client: storage.Client | None = None

    @property
    def bucket_name(self) -> str:
        return self._bucket_name

    def _get_client(self) -> storage.Client:
        if self._client is None:
            self._client = storage.Client()
        return self._client

    def upload(self, user_id: str, content: bytes, content_type: str) -> str:
        ext = ALLOWED_AVATAR_TYPES[content_type]
        blob_name = f"{user_id}/{uuid.uuid4().hex}.{ext}"
        bucket = self._get_client().bucket(self._bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(content, content_type=content_type)
        return f"https://storage.googleapis.com/{self._bucket_name}/{blob_name}"

    def delete_by_url(self, url: str) -> None:
        """Best-effort delete. Logs but never raises (orphan tolerable)."""
        prefix = f"https://storage.googleapis.com/{self._bucket_name}/"
        if not url.startswith(prefix):
            return
        blob_name = url[len(prefix) :]
        try:
            self._get_client().bucket(self._bucket_name).blob(blob_name).delete()
        except Exception as err:
            logger.warning(
                "Avatar blob delete failed bucket=%s blob=%s err=%s",
                self._bucket_name,
                blob_name,
                err,
            )
