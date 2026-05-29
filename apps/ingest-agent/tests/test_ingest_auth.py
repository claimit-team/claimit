"""Tests for verify_gateway_oidc (synchronous /internal/extract auth).

Mirrors apps/assistant-agent/tests/test_auth.py. The audience must be the
bare service origin (api-gateway mints tokens against INGEST_AGENT_URL,
which has no path). The token-verification network path is not exercised
here — only the audience derivation, the disable-bypass, and the
header-shape 401s, which need no signing keys.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from src.auth import _expected_gateway_audience, verify_gateway_oidc


class _FakeURL:
    def __init__(self, scheme: str, netloc: str, path: str) -> None:
        self.scheme = scheme
        self.netloc = netloc
        self.path = path

    def replace(self, *, scheme: str | None = None, query: str | None = None) -> _FakeURL:
        return _FakeURL(scheme or self.scheme, self.netloc, self.path)


class _FakeRequest:
    def __init__(self, url: _FakeURL, headers: dict[str, str] | None = None) -> None:
        self.url = url
        self.headers = headers or {}


def test_expected_gateway_audience_is_service_origin_not_path() -> None:
    request = _FakeRequest(
        _FakeURL("https", "claimit-ingest-agent-abc.run.app", "/internal/extract"),
        headers={"x-forwarded-proto": "https"},
    )
    assert _expected_gateway_audience(request) == "https://claimit-ingest-agent-abc.run.app"


@pytest.mark.asyncio
async def test_verify_gateway_oidc_bypassed_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_AUTH_DISABLED", "1")
    request = _FakeRequest(_FakeURL("https", "ingest.run.app", "/internal/extract"))
    # No Authorization header, but the bypass returns before any check.
    assert await verify_gateway_oidc(request) is None  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_verify_gateway_oidc_rejects_missing_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_AUTH_DISABLED", raising=False)
    request = _FakeRequest(_FakeURL("https", "ingest.run.app", "/internal/extract"))
    with pytest.raises(HTTPException) as exc:
        await verify_gateway_oidc(request)  # type: ignore[arg-type]
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_gateway_oidc_rejects_malformed_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("INTERNAL_AUTH_DISABLED", raising=False)
    request = _FakeRequest(
        _FakeURL("https", "ingest.run.app", "/internal/extract"),
        headers={"Authorization": "Basic abc"},
    )
    with pytest.raises(HTTPException) as exc:
        await verify_gateway_oidc(request)  # type: ignore[arg-type]
    assert exc.value.status_code == 401
