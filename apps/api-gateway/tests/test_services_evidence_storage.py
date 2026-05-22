"""Tests for EvidenceReader fail-fast construction + download surface.

Mirrors test_services_receipts_storage.py — the EvidenceReader is the
read-only counterpart of ReceiptsUploader and shares the same operational
contract (fail-fast on missing bucket env, 404-collapse on GCS NotFound,
403-collapse-with-ERROR-log on Forbidden so IAM regressions alert).
"""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from google.api_core import exceptions as gcs_exceptions
from src.services.evidence_storage import EvidenceObjectMissingError, EvidenceReader


def test_init_raises_when_bucket_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing EVIDENCE_BUCKET must crash construction, not the first request."""
    monkeypatch.delenv("EVIDENCE_BUCKET", raising=False)
    with pytest.raises(RuntimeError, match="EVIDENCE_BUCKET"):
        EvidenceReader()


def test_init_accepts_explicit_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EVIDENCE_BUCKET", raising=False)
    reader = EvidenceReader(bucket_name="my-evidence-bucket")
    assert reader.bucket_name == "my-evidence-bucket"


def test_init_reads_env_when_no_arg(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EVIDENCE_BUCKET", "env-evidence-bucket")
    reader = EvidenceReader()
    assert reader.bucket_name == "env-evidence-bucket"


def test_download_returns_bytes_and_content_type(monkeypatch: pytest.MonkeyPatch) -> None:
    """Happy path: download_as_bytes + content_type round-trip."""
    monkeypatch.delenv("EVIDENCE_BUCKET", raising=False)
    reader = EvidenceReader(bucket_name="b")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.return_value = b"\x89PNG\r\n\x1a\nfake"
    fake_blob.content_type = "image/png"
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with patch.object(reader, "_get_client", return_value=fake_client):
        data, content_type = asyncio.run(reader.download(blob_path="evidence/x.png"))

    assert data == b"\x89PNG\r\n\x1a\nfake"
    assert content_type == "image/png"
    fake_bucket.blob.assert_called_once_with("evidence/x.png")


def test_download_falls_back_to_octet_stream_when_content_type_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("EVIDENCE_BUCKET", raising=False)
    reader = EvidenceReader(bucket_name="b")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.return_value = b"raw"
    fake_blob.content_type = None
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with patch.object(reader, "_get_client", return_value=fake_client):
        _, content_type = asyncio.run(reader.download(blob_path="raw.bin"))

    assert content_type == "application/octet-stream"


def test_download_raises_evidence_object_missing_for_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("EVIDENCE_BUCKET", raising=False)
    reader = EvidenceReader(bucket_name="b")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.side_effect = gcs_exceptions.NotFound("not found")
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with (
        patch.object(reader, "_get_client", return_value=fake_client),
        pytest.raises(EvidenceObjectMissingError),
    ):
        asyncio.run(reader.download(blob_path="gone.png"))


def test_download_raises_evidence_object_missing_for_403_and_logs(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """403 (IAM regression) collapses to EvidenceObjectMissingError but logs distinctly.

    Same external surface as a 404, but the logs MUST carry the bucket
    + blob path so an alert can fire on an IAM regression
    (api_gateway_evidence_reader binding accidentally dropped, etc.).
    """
    monkeypatch.delenv("EVIDENCE_BUCKET", raising=False)
    reader = EvidenceReader(bucket_name="evidence-bucket")

    fake_blob = MagicMock()
    fake_blob.download_as_bytes.side_effect = gcs_exceptions.Forbidden("denied")
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with (
        patch.object(reader, "_get_client", return_value=fake_client),
        caplog.at_level("ERROR", logger="src.services.evidence_storage"),
        pytest.raises(EvidenceObjectMissingError),
    ):
        asyncio.run(reader.download(blob_path="denied.png"))

    assert any("IAM regression" in record.message for record in caplog.records)
    assert any("evidence-bucket" in record.message for record in caplog.records)
    assert any("denied.png" in record.message for record in caplog.records)
