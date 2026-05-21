"""Tests for ReceiptsUploader fail-fast construction + download surface."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from google.api_core import exceptions as gcs_exceptions
from src.services.receipts_storage import ReceiptObjectMissingError, ReceiptsUploader


def test_init_raises_when_bucket_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing RECEIPTS_BUCKET must crash construction, not the first upload."""
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    with pytest.raises(RuntimeError, match="RECEIPTS_BUCKET"):
        ReceiptsUploader()


def test_init_accepts_explicit_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    uploader = ReceiptsUploader(bucket_name="my-bucket")
    assert uploader._bucket_name == "my-bucket"
    assert uploader.bucket_name == "my-bucket"


def test_init_reads_env_when_no_arg(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RECEIPTS_BUCKET", "env-bucket")
    uploader = ReceiptsUploader()
    assert uploader._bucket_name == "env-bucket"
    assert uploader.bucket_name == "env-bucket"


def test_download_returns_bytes_and_content_type(monkeypatch: pytest.MonkeyPatch) -> None:
    """Happy path: download_as_bytes + content_type round-trip."""
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    uploader = ReceiptsUploader(bucket_name="b")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.return_value = b"%PDF-1.4 ..."
    fake_blob.content_type = "application/pdf"
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with patch.object(uploader, "_get_client", return_value=fake_client):
        data, content_type = asyncio.run(uploader.download(blob_path="receipts/x.pdf"))

    assert data == b"%PDF-1.4 ..."
    assert content_type == "application/pdf"
    fake_bucket.blob.assert_called_once_with("receipts/x.pdf")


def test_download_falls_back_to_octet_stream_when_content_type_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Defensive: an upload that somehow set no content_type still returns a valid mime."""
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    uploader = ReceiptsUploader(bucket_name="b")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.return_value = b"raw"
    fake_blob.content_type = None
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with patch.object(uploader, "_get_client", return_value=fake_client):
        _, content_type = asyncio.run(uploader.download(blob_path="raw.bin"))

    assert content_type == "application/octet-stream"


def test_download_raises_receipt_object_missing_for_404(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing object in GCS becomes ReceiptObjectMissing — caller maps to 404."""
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    uploader = ReceiptsUploader(bucket_name="b")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.side_effect = gcs_exceptions.NotFound("not found")
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with (
        patch.object(uploader, "_get_client", return_value=fake_client),
        pytest.raises(ReceiptObjectMissingError),
    ):
        asyncio.run(uploader.download(blob_path="gone.pdf"))
