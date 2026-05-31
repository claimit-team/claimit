"""Tests for claimit_mcp.mongodb.get_mongodb_mcp_toolset (ticket 5.10).

Covers the env-var-driven transport selection added in this ticket:
- `MDB_MCP_URL` unset → stdio toolset, `--readOnly` flag respects the
  `read_only` arg.
- `MDB_MCP_URL` set → Streamable-HTTP toolset, URL ends in `/mcp`,
  `httpx_client_factory` is wired, OIDC audience matches the bare URL.
- URL normalization: trailing slash on `MDB_MCP_URL` doesn't produce a
  double slash before `/mcp`.
- Vestigial `read_only` on the HTTP path: still picks HTTP regardless
  of the flag (the deployed server decides what tools to register;
  caller picks the right URL).

Tests introspect the returned `McpToolset` by reading its
`_mcp_session_manager._connection_params`. ADK doesn't expose those
publicly but they're stable across the versions this repo pins —
exposing the same shape is the whole contract of the factory.
"""

from __future__ import annotations

import pytest
from claimit_mcp import get_mongodb_mcp_toolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
    StreamableHTTPConnectionParams,
)


def _connection_params(toolset):
    """Pull the connection_params off the McpToolset. ADK's attribute is
    private (`_mcp_session_manager._connection_params`); centralizing
    the access here keeps every test resilient to a single ADK
    refactor."""
    return toolset._mcp_session_manager._connection_params


# ---------------------------------------------------------------------------
# Stdio path (MDB_MCP_URL unset)
# ---------------------------------------------------------------------------


def test_stdio_path_read_only_true_passes_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """No MDB_MCP_URL → stdio. read_only=True → `--readOnly` in the args."""
    monkeypatch.delenv("MDB_MCP_URL", raising=False)

    toolset = get_mongodb_mcp_toolset(read_only=True)
    params = _connection_params(toolset)
    assert isinstance(params, StdioConnectionParams)
    args = params.server_params.args
    assert "--readOnly" in args
    assert args[:2] == ["-y", "mongodb-mcp-server@latest"]


def test_stdio_path_read_only_false_omits_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """read_only=False → no `--readOnly`. The 3 write agents (ingest /
    monitor / claim) take this branch in local dev."""
    monkeypatch.delenv("MDB_MCP_URL", raising=False)

    toolset = get_mongodb_mcp_toolset(read_only=False)
    params = _connection_params(toolset)
    assert isinstance(params, StdioConnectionParams)
    assert "--readOnly" not in params.server_params.args


def test_stdio_path_empty_url_env_is_treated_as_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`MDB_MCP_URL=""` (empty string) should fall through to stdio.
    Pins the `.strip()` + truthy check in the factory — protects against
    a Terraform output that resolves to an empty string at deploy time."""
    monkeypatch.setenv("MDB_MCP_URL", "")

    toolset = get_mongodb_mcp_toolset(read_only=True)
    params = _connection_params(toolset)
    assert isinstance(params, StdioConnectionParams)


def test_stdio_path_whitespace_only_url_is_treated_as_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Whitespace-only URL strip()s to empty → stdio. Same guard rationale."""
    monkeypatch.setenv("MDB_MCP_URL", "   \t  ")

    toolset = get_mongodb_mcp_toolset(read_only=True)
    params = _connection_params(toolset)
    assert isinstance(params, StdioConnectionParams)


# ---------------------------------------------------------------------------
# HTTP path (MDB_MCP_URL set)
# ---------------------------------------------------------------------------


def test_http_path_returns_streamable_http_connection_params(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`MDB_MCP_URL` set → StreamableHTTPConnectionParams, NOT stdio.
    URL gets `/mcp` appended (MCP endpoint convention)."""
    monkeypatch.setenv("MDB_MCP_URL", "https://claimit-mongodb-mcp-readonly.run.app")

    toolset = get_mongodb_mcp_toolset(read_only=True)
    params = _connection_params(toolset)
    assert isinstance(params, StreamableHTTPConnectionParams)
    assert params.url == "https://claimit-mongodb-mcp-readonly.run.app/mcp"


def test_http_path_strips_trailing_slash_before_appending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bare URL might or might not have a trailing slash depending on
    where it came from (gcloud, Terraform output, hand-pasted env).
    Make sure we don't end up with `//mcp`."""
    monkeypatch.setenv("MDB_MCP_URL", "https://claimit-mongodb-mcp-readonly.run.app/")

    toolset = get_mongodb_mcp_toolset(read_only=True)
    params = _connection_params(toolset)
    assert params.url == "https://claimit-mongodb-mcp-readonly.run.app/mcp"


def test_http_path_ignores_read_only_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """read_only is vestigial on the HTTP path — the server decides what
    tools to register based on its own MDB_MCP_READ_ONLY env. The
    caller picks the right URL (the deploy_agents.py AGENT_READONLY_MAP).
    This test pins that the factory doesn't second-guess the routing."""
    monkeypatch.setenv("MDB_MCP_URL", "https://anything.run.app")

    ro = get_mongodb_mcp_toolset(read_only=True)
    rw = get_mongodb_mcp_toolset(read_only=False)
    assert isinstance(_connection_params(ro), StreamableHTTPConnectionParams)
    assert isinstance(_connection_params(rw), StreamableHTTPConnectionParams)
    # Identical URL regardless of the flag — proof we didn't fork the
    # connection target on read_only.
    assert _connection_params(ro).url == _connection_params(rw).url


def test_http_path_httpx_client_factory_is_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """The factory must be callable — ADK invokes it to construct the
    AsyncClient used by the underlying mcp-python streamable_http
    transport. We don't exercise the factory here (it tries to fetch a
    real OIDC token); just verify it's wired."""
    monkeypatch.setenv("MDB_MCP_URL", "https://anything.run.app")

    toolset = get_mongodb_mcp_toolset()
    params = _connection_params(toolset)
    assert callable(params.httpx_client_factory)


# ---------------------------------------------------------------------------
# call_mongodb_mcp_tool + extract_tool_documents — the Gemini-friendly path
# (thin FunctionTool wrappers call these; raw MCP toolset schemas are rejected
# by google-genai function-calling, so the wrapper is the runtime MCP path).
# ---------------------------------------------------------------------------


def test_call_tool_requires_mcp_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """With no MDB_MCP_URL and no explicit override, the helper raises before
    attempting any connection — the HTTP transport is the only reachable one
    from Agent Engine (no Node for stdio)."""
    import asyncio

    from claimit_mcp import call_mongodb_mcp_tool

    monkeypatch.delenv("MDB_MCP_URL", raising=False)
    with pytest.raises(RuntimeError, match="MDB_MCP_URL"):
        asyncio.run(call_mongodb_mcp_tool("find", {}))


class _FakeContent:
    def __init__(self, text: str) -> None:
        self.text = text


class _FakeResult:
    def __init__(self, content) -> None:
        self.content = content


def test_extract_documents_parses_json_array() -> None:
    from claimit_mcp import extract_tool_documents

    result = _FakeResult([_FakeContent('[{"platform": "amazon"}, {"platform": "hilton"}]')])
    assert extract_tool_documents(result) == [{"platform": "amazon"}, {"platform": "hilton"}]


def test_extract_documents_parses_single_object() -> None:
    from claimit_mcp import extract_tool_documents

    result = _FakeResult([_FakeContent('{"platform": "best_buy", "window_days": 15}')])
    assert extract_tool_documents(result) == [{"platform": "best_buy", "window_days": 15}]


def test_extract_documents_falls_back_to_text_when_not_json() -> None:
    """mongodb-mcp-server sometimes prefixes results with prose; if a content
    block isn't parseable JSON we surface it as {"text": ...} so the LLM still
    gets something rather than the wrapper silently returning []."""
    from claimit_mcp import extract_tool_documents

    result = _FakeResult([_FakeContent("No documents matched the filter.")])
    assert extract_tool_documents(result) == [{"text": "No documents matched the filter."}]


def test_extract_documents_handles_empty_or_missing_content() -> None:
    from claimit_mcp import extract_tool_documents

    assert extract_tool_documents(_FakeResult([])) == []
    assert extract_tool_documents(_FakeResult(None)) == []
