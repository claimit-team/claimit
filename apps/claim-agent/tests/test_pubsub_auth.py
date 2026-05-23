"""Tests for Pub/Sub OIDC verification on claim-agent."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from src import auth


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_disabled() -> None:
    req = MagicMock()
    with patch.dict(auth.os.environ, {"PUBSUB_AUTH_DISABLED": "1"}):
        await auth.verify_pubsub_oidc(req)


@pytest.mark.asyncio
async def test_verify_pubsub_oidc_missing_header() -> None:
    req = MagicMock()
    req.headers = {}
    with patch.dict(auth.os.environ, {}, clear=True), pytest.raises(HTTPException) as exc:
        await auth.verify_pubsub_oidc(req)
    assert exc.value.status_code == 401
