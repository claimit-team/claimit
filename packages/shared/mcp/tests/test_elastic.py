"""Tests for claimit_mcp.elastic — the Elastic Agent Builder MCP factory.

Covers the ways this server differs from mongodb/phoenix:
- HTTP-only: there is NO stdio fallback, so a missing ELASTIC_KIBANA_URL or
  ELASTIC_API_KEY raises rather than spawning a child process.
- The Kibana REST path is `/api/agent_builder/mcp` (not `/mcp`), with an
  optional space-scoped `/s/{space}` prefix.
- Auth is a static `Authorization: ApiKey <key>` header injected via a request
  EVENT HOOK that reads the key from env AT REQUEST TIME (no secret captured
  into a closure → nothing to leak through a cloudpickle).
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from claimit_mcp import (
    call_elastic_mcp_tool,
    extract_agent_builder_documents,
    get_elastic_mcp_toolset,
)
from claimit_mcp import elastic as elastic_mod
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams


class _FakeContent:
    def __init__(self, text: str) -> None:
        self.text = text


class _FakeResult:
    def __init__(self, content) -> None:
        self.content = content


def _text_result(obj) -> _FakeResult:
    return _FakeResult([_FakeContent(json.dumps(obj))])


def _connection_params(toolset):
    return toolset._mcp_session_manager._connection_params


def _set_env(monkeypatch, *, url="https://kibana.example.es.io", key="ES_KEY_123456"):
    monkeypatch.setenv("ELASTIC_KIBANA_URL", url)
    monkeypatch.setenv("ELASTIC_API_KEY", key)
    monkeypatch.delenv("ELASTIC_KIBANA_SPACE", raising=False)


# ---------------------------------------------------------------------------
# get_elastic_mcp_toolset — env guards + URL building (no stdio fallback)
# ---------------------------------------------------------------------------


def test_toolset_requires_kibana_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ELASTIC_KIBANA_URL", raising=False)
    monkeypatch.setenv("ELASTIC_API_KEY", "ES_KEY_123456")
    with pytest.raises(RuntimeError, match="ELASTIC_KIBANA_URL"):
        get_elastic_mcp_toolset()


def test_toolset_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ELASTIC_KIBANA_URL", "https://kibana.example.es.io")
    monkeypatch.delenv("ELASTIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="ELASTIC_API_KEY"):
        get_elastic_mcp_toolset()


def test_http_path_builds_agent_builder_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_env(monkeypatch)
    params = _connection_params(get_elastic_mcp_toolset())
    assert isinstance(params, StreamableHTTPConnectionParams)
    assert params.url == "https://kibana.example.es.io/api/agent_builder/mcp"
    assert callable(params.httpx_client_factory)


def test_http_path_strips_trailing_slash(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_env(monkeypatch, url="https://kibana.example.es.io/")
    params = _connection_params(get_elastic_mcp_toolset())
    assert params.url == "https://kibana.example.es.io/api/agent_builder/mcp"


def test_space_scoped_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_env(monkeypatch)
    monkeypatch.setenv("ELASTIC_KIBANA_SPACE", "claimit")
    params = _connection_params(get_elastic_mcp_toolset())
    assert params.url == "https://kibana.example.es.io/s/claimit/api/agent_builder/mcp"


def test_default_tool_filter_is_policies(monkeypatch: pytest.MonkeyPatch) -> None:
    # tool_filter lives on the McpToolset, not on connection_params.
    _set_env(monkeypatch)
    toolset = get_elastic_mcp_toolset()
    assert toolset.tool_filter == ["search_policies"]


def test_tool_filter_override(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_env(monkeypatch)
    toolset = get_elastic_mcp_toolset(tool_filter=["search_policies", "aggregate_claims"])
    assert toolset.tool_filter == ["search_policies", "aggregate_claims"]


# ---------------------------------------------------------------------------
# call_elastic_mcp_tool — guards before any connection attempt
# ---------------------------------------------------------------------------


def test_call_tool_requires_kibana_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ELASTIC_KIBANA_URL", raising=False)
    monkeypatch.setenv("ELASTIC_API_KEY", "ES_KEY_123456")
    with pytest.raises(RuntimeError, match="ELASTIC_KIBANA_URL"):
        asyncio.run(call_elastic_mcp_tool("search_policies", {"query": "x"}))


def test_call_tool_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ELASTIC_KIBANA_URL", "https://kibana.example.es.io")
    monkeypatch.delenv("ELASTIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="ELASTIC_API_KEY"):
        asyncio.run(call_elastic_mcp_tool("search_policies", {"query": "x"}))


# ---------------------------------------------------------------------------
# _build_api_key_client_factory — static ApiKey header via event hook,
# key read from env at request time (not captured into a closure).
# ---------------------------------------------------------------------------


def test_api_key_factory_sets_default_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ELASTIC_API_KEY", "KEY1_abcdef")
    factory = elastic_mod._build_api_key_client_factory()

    async def _check() -> None:
        client = factory()
        try:
            assert client.headers.get("authorization") == "ApiKey KEY1_abcdef"
            # The request event hook must be installed (the Agent-Engine fix).
            assert len(client.event_hooks["request"]) >= 1
        finally:
            await client.aclose()

    asyncio.run(_check())


def test_api_key_hook_reads_env_at_request_time(monkeypatch: pytest.MonkeyPatch) -> None:
    """The hook reads ELASTIC_API_KEY from env on each request — the key is NOT
    captured into a closure variable, so nothing is serialized into a pickle."""
    monkeypatch.setenv("ELASTIC_API_KEY", "KEY1_abcdef")
    factory = elastic_mod._build_api_key_client_factory()

    async def _check() -> None:
        client = factory()
        try:
            hook = client.event_hooks["request"][0]
            # Rotate the key AFTER building the client; the hook must pick it up.
            monkeypatch.setenv("ELASTIC_API_KEY", "KEY2_zzzzzz")
            req = httpx.Request("POST", "https://kibana.example.es.io/api/agent_builder/mcp")
            await hook(req)
            assert req.headers["authorization"] == "ApiKey KEY2_zzzzzz"
        finally:
            await client.aclose()

    asyncio.run(_check())


# ---------------------------------------------------------------------------
# extract_agent_builder_documents — unpacks the ES|QL {"results":[...]} envelope.
# Envelope shape verified live against Kibana 9.4.1 (type: "esql_results").
# ---------------------------------------------------------------------------

# Trimmed real envelope: a `query` echo entry + an `esql_results` rows entry.
_AB_ENVELOPE = {
    "results": [
        {"type": "query", "data": {"esql": "FROM policies-fulltext ..."}, "tool_result_id": "a"},
        {
            "type": "esql_results",
            "tool_result_id": "b",
            "data": {
                "source": "esql",
                "query": "FROM policies-fulltext ...",
                "columns": [
                    {"name": "platform", "type": "keyword"},
                    {"name": "policy_text_full", "type": "text"},
                    {"name": "key_exclusions", "type": "keyword"},
                ],
                "values": [
                    ["hilton", "Hilton Price Match ...", ["Hilton Honors membership required"]],
                    ["walmart", "Walmart has no post-purchase price match.", []],
                ],
            },
        },
    ]
}


def test_extract_agent_builder_zips_columns_and_values() -> None:
    docs = extract_agent_builder_documents(_text_result(_AB_ENVELOPE))
    assert docs == [
        {
            "platform": "hilton",
            "policy_text_full": "Hilton Price Match ...",
            "key_exclusions": ["Hilton Honors membership required"],
        },
        {
            "platform": "walmart",
            "policy_text_full": "Walmart has no post-purchase price match.",
            "key_exclusions": [],
        },
    ]


def test_extract_agent_builder_empty_rows() -> None:
    env = {
        "results": [
            {"type": "esql_results", "data": {"columns": [{"name": "platform"}], "values": []}}
        ]
    }
    assert extract_agent_builder_documents(_text_result(env)) == []


def test_extract_agent_builder_falls_back_to_flat_array() -> None:
    """A non-enveloped flat JSON array (e.g. another tool) parses via the
    generic fallback, so this is safe as the single parser."""
    flat = [{"platform": "best_buy", "policy_text_full": "..."}]
    assert extract_agent_builder_documents(_text_result(flat)) == flat
