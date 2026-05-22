"""Tests for gateway OIDC auth audience (ticket 5.9)."""

from __future__ import annotations

from src.auth import _expected_audience


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


def test_expected_audience_uses_service_origin_not_path() -> None:
    request = _FakeRequest(
        _FakeURL("https", "claimit-assistant-agent-abc.run.app", "/internal/mode-b/stream"),
        headers={"x-forwarded-proto": "https"},
    )
    assert _expected_audience(request) == "https://claimit-assistant-agent-abc.run.app"
