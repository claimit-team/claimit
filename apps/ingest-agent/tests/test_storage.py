"""Tests for the ingest-agent GCS receipts reader (ticket 5.14)."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from google.api_core import exceptions as gcs_exceptions
from src.storage import ReceiptObjectMissingError, ReceiptsReader, parse_gs_uri


def test_init_raises_when_bucket_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    with pytest.raises(RuntimeError, match="RECEIPTS_BUCKET"):
        ReceiptsReader()


def test_init_accepts_explicit_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    reader = ReceiptsReader(bucket_name="rec-bucket")
    assert reader.bucket_name == "rec-bucket"


def test_init_reads_env_when_no_arg(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RECEIPTS_BUCKET", "env-bucket")
    reader = ReceiptsReader()
    assert reader.bucket_name == "env-bucket"


def test_download_returns_bytes_and_content_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    reader = ReceiptsReader(bucket_name="rec-bucket")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.return_value = b"\xff\xd8\xff\xe0jpeg"
    fake_blob.content_type = "image/jpeg"
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with patch.object(reader, "_get_client", return_value=fake_client):
        data, content_type = asyncio.run(reader.download(blob_path="receipts/u/p/x.jpg"))

    assert data == b"\xff\xd8\xff\xe0jpeg"
    assert content_type == "image/jpeg"
    fake_bucket.blob.assert_called_once_with("receipts/u/p/x.jpg")


def test_download_raises_object_missing_for_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    reader = ReceiptsReader(bucket_name="rec-bucket")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.side_effect = gcs_exceptions.NotFound("missing")
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with (
        patch.object(reader, "_get_client", return_value=fake_client),
        pytest.raises(ReceiptObjectMissingError),
    ):
        asyncio.run(reader.download(blob_path="gone.pdf"))


@pytest.mark.parametrize(
    ("uri", "expected"),
    [
        ("gs://bucket/path", ("bucket", "path")),
        ("gs://bucket/nested/path/file.pdf", ("bucket", "nested/path/file.pdf")),
    ],
)
def test_parse_gs_uri_happy_paths(uri: str, expected: tuple[str, str]) -> None:
    assert parse_gs_uri(uri) == expected


@pytest.mark.parametrize(
    "malformed",
    [
        "",
        "not-a-gs-uri",
        "https://bucket/path",
        "gs:/bucket/path",
        "gs://",
        "gs://bucketonly",
    ],
)
def test_parse_gs_uri_rejects_malformed(malformed: str) -> None:
    with pytest.raises(ValueError):
        parse_gs_uri(malformed)
