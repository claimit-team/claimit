"""Tests for ReceiptsUploader fail-fast construction."""

from __future__ import annotations

import pytest
from src.services.receipts_storage import ReceiptsUploader


def test_init_raises_when_bucket_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing RECEIPTS_BUCKET must crash construction, not the first upload."""
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    with pytest.raises(RuntimeError, match="RECEIPTS_BUCKET"):
        ReceiptsUploader()


def test_init_accepts_explicit_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RECEIPTS_BUCKET", raising=False)
    uploader = ReceiptsUploader(bucket_name="my-bucket")
    assert uploader._bucket_name == "my-bucket"


def test_init_reads_env_when_no_arg(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RECEIPTS_BUCKET", "env-bucket")
    uploader = ReceiptsUploader()
    assert uploader._bucket_name == "env-bucket"
