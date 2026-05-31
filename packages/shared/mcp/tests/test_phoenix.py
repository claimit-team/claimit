"""Tests for claimit_mcp.phoenix — the Phoenix MCP read side.

Covers:
- transport selection for `get_phoenix_mcp_toolset` (stdio vs Streamable-HTTP,
  driven by `PHOENIX_MCP_URL`), mirroring the MongoDB MCP factory tests.
- `call_phoenix_mcp_tool` requires `PHOENIX_MCP_URL`.
- `read_claim_reasoning_spans` status discriminator (ok/pending/timeout/
  unavailable) and the CLIENT-SIDE `claim.id` filter — the tenancy-critical
  backstop, since phoenix-mcp's `get-spans` has no server-side attribute filter.
- `summarize_recent_spans` returns counts only and NEVER leaks span attributes
  (cross-user prompt/response content).
"""

from __future__ import annotations

import asyncio
import json

import pytest
from claimit_mcp import (
    call_phoenix_mcp_tool,
    get_phoenix_mcp_toolset,
    read_claim_reasoning_spans,
    summarize_recent_spans,
)
from claimit_mcp import phoenix as phoenix_mod
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
    StreamableHTTPConnectionParams,
)


def _connection_params(toolset):
    return toolset._mcp_session_manager._connection_params


class _FakeContent:
    def __init__(self, text: str) -> None:
        self.text = text


class _FakeResult:
    def __init__(self, content) -> None:
        self.content = content


def _spans_result(spans: list[dict]) -> _FakeResult:
    """Build a fake get-spans CallToolResult: one TextContent block of JSON."""
    return _FakeResult([_FakeContent(json.dumps(spans))])


# ---------------------------------------------------------------------------
# Transport selection (PHOENIX_MCP_URL)
# ---------------------------------------------------------------------------


def test_stdio_path_when_url_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """No PHOENIX_MCP_URL → stdio toolset spawning npx @arizeai/phoenix-mcp."""
    monkeypatch.delenv("PHOENIX_MCP_URL", raising=False)

    toolset = get_phoenix_mcp_toolset()
    params = _connection_params(toolset)
    assert isinstance(params, StdioConnectionParams)
    assert params.server_params.args[:2] == ["-y", "@arizeai/phoenix-mcp@latest"]


def test_http_path_appends_mcp(monkeypatch: pytest.MonkeyPatch) -> None:
    """PHOENIX_MCP_URL set → StreamableHTTPConnectionParams, URL ends in /mcp."""
    monkeypatch.setenv("PHOENIX_MCP_URL", "https://claimit-phoenix-mcp.run.app")

    params = _connection_params(get_phoenix_mcp_toolset())
    assert isinstance(params, StreamableHTTPConnectionParams)
    assert params.url == "https://claimit-phoenix-mcp.run.app/mcp"
    assert callable(params.httpx_client_factory)


def test_http_path_strips_trailing_slash(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PHOENIX_MCP_URL", "https://claimit-phoenix-mcp.run.app/")

    params = _connection_params(get_phoenix_mcp_toolset())
    assert params.url == "https://claimit-phoenix-mcp.run.app/mcp"


# ---------------------------------------------------------------------------
# call_phoenix_mcp_tool guard
# ---------------------------------------------------------------------------


def test_call_tool_requires_mcp_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PHOENIX_MCP_URL", raising=False)
    with pytest.raises(RuntimeError, match="PHOENIX_MCP_URL"):
        asyncio.run(call_phoenix_mcp_tool("get-spans", {}))


# ---------------------------------------------------------------------------
# read_claim_reasoning_spans — status discriminator + client-side claim filter
# ---------------------------------------------------------------------------


def test_read_unavailable_when_url_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """No PHOENIX_MCP_URL → unavailable, WITHOUT attempting a connection."""
    monkeypatch.delenv("PHOENIX_MCP_URL", raising=False)
    result = asyncio.run(read_claim_reasoning_spans("C1"))
    assert result.status == "unavailable"
    assert result.spans == []


def test_read_filters_by_claim_id_client_side(monkeypatch: pytest.MonkeyPatch) -> None:
    """get-spans returns spans for multiple claims (no server-side attribute
    filter); only the requested claim's spans survive — the tenancy backstop."""
    monkeypatch.setenv("PHOENIX_MCP_URL", "https://x.run.app")
    fake = _spans_result(
        [
            {
                "name": "validator.validate",
                "attributes": {"claim.id": "C1", "validator.issue_count": 0},
                "status_code": "OK",
            },
            {
                "name": "validator.validate",
                "attributes": {"claim.id": "OTHER", "validator.issue_count": 3},
                "status_code": "OK",
            },
        ]
    )

    async def _fake_call(tool_name, arguments, *, mcp_url=None):
        return fake

    monkeypatch.setattr(phoenix_mod, "call_phoenix_mcp_tool", _fake_call)
    result = asyncio.run(read_claim_reasoning_spans("C1"))
    assert result.status == "ok"
    assert len(result.spans) == 1
    assert result.spans[0].attributes["claim.id"] == "C1"


def test_read_pending_when_no_matching_spans(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PHOENIX_MCP_URL", "https://x.run.app")

    async def _fake_call(tool_name, arguments, *, mcp_url=None):
        return _spans_result([{"name": "validator.validate", "attributes": {"claim.id": "OTHER"}}])

    monkeypatch.setattr(phoenix_mod, "call_phoenix_mcp_tool", _fake_call)
    result = asyncio.run(read_claim_reasoning_spans("C1"))
    assert result.status == "pending"


def test_read_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PHOENIX_MCP_URL", "https://x.run.app")

    async def _slow_call(tool_name, arguments, *, mcp_url=None):
        await asyncio.sleep(1.0)
        return _spans_result([])

    monkeypatch.setattr(phoenix_mod, "call_phoenix_mcp_tool", _slow_call)
    result = asyncio.run(read_claim_reasoning_spans("C1", timeout=0.05))
    assert result.status == "timeout"


def test_read_unavailable_on_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PHOENIX_MCP_URL", "https://x.run.app")

    async def _boom(tool_name, arguments, *, mcp_url=None):
        raise ValueError("connection reset")

    monkeypatch.setattr(phoenix_mod, "call_phoenix_mcp_tool", _boom)
    result = asyncio.run(read_claim_reasoning_spans("C1"))
    assert result.status == "unavailable"


def test_read_parses_stringified_list_attributes(monkeypatch: pytest.MonkeyPatch) -> None:
    """claim-agent emits some attrs as str(list); the reader parses them back so
    the assistant aggregator gets a real list, not a stringified blob."""
    monkeypatch.setenv("PHOENIX_MCP_URL", "https://x.run.app")

    async def _fake_call(tool_name, arguments, *, mcp_url=None):
        return _spans_result(
            [
                {
                    "name": "validator.validate",
                    "attributes": {
                        "claim.id": "C1",
                        "validator.issue_types": "['placeholder', 'order_id']",
                    },
                }
            ]
        )

    monkeypatch.setattr(phoenix_mod, "call_phoenix_mcp_tool", _fake_call)
    result = asyncio.run(read_claim_reasoning_spans("C1"))
    assert result.status == "ok"
    assert result.spans[0].attributes["validator.issue_types"] == ["placeholder", "order_id"]


def test_read_uses_project_name_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """project_identifier defaults from PHOENIX_PROJECT_NAME and the span-`names`
    server-side filter is sent (the only way to bound the payload)."""
    monkeypatch.setenv("PHOENIX_MCP_URL", "https://x.run.app")
    monkeypatch.setenv("PHOENIX_PROJECT_NAME", "claimit")
    captured: dict = {}

    async def _fake_call(tool_name, arguments, *, mcp_url=None):
        captured["tool"] = tool_name
        captured["args"] = arguments
        return _spans_result([{"name": "validator.validate", "attributes": {"claim.id": "C1"}}])

    monkeypatch.setattr(phoenix_mod, "call_phoenix_mcp_tool", _fake_call)
    asyncio.run(read_claim_reasoning_spans("C1"))
    assert captured["tool"] == "get-spans"
    assert captured["args"]["project_identifier"] == "claimit"
    assert captured["args"]["names"] == ["validator.validate", "self_evaluate.evaluate"]


# ---------------------------------------------------------------------------
# summarize_recent_spans — sanitized, NO attribute leak
# ---------------------------------------------------------------------------


def test_summarize_strips_attributes_and_counts() -> None:
    """The four-agent breadth tool returns counts only; span attributes (which
    carry cross-user prompt/response content) must never appear in the output."""
    result = _spans_result(
        [
            {"name": "validator.validate", "status_code": "OK", "attributes": {"claim.id": "C1"}},
            {"name": "validator.validate", "status_code": "OK", "attributes": {"claim.id": "C2"}},
            {
                "name": "self_evaluate.evaluate",
                "status_code": "ERROR",
                "attributes": {"input.value": "secret prompt text"},
            },
        ]
    )
    summary = summarize_recent_spans(result)

    # No attribute content leaks through.
    for row in summary:
        assert set(row.keys()) == {"span_name", "status_code", "count"}
    flat = {(r["span_name"], r["status_code"]): r["count"] for r in summary}
    assert flat[("validator.validate", "OK")] == 2
    assert flat[("self_evaluate.evaluate", "ERROR")] == 1
    # Belt-and-suspenders: the sensitive value never appears anywhere.
    assert "secret prompt text" not in json.dumps(summary)
