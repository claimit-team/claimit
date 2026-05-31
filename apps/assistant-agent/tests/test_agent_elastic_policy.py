"""Unit tests for agent.py's Elastic Agent Builder MCP policy tool.

Exercises `_search_policy_text` / `search_policies_fulltext` with
`call_elastic_mcp_tool` monkeypatched (mirrors how test_phoenix patches the
MCP call). Proves the wiring offline: the call args, the empty-query guard, and
the BUG-31/61 `search_unavailable` contract — including that the error `detail`
is the exception CLASS name only (never str(exc), which would leak the Kibana
URL embedded in httpx errors).
"""

from __future__ import annotations

import asyncio
import json

import pytest
from src import agent as agent_mod


class _FakeContent:
    def __init__(self, text: str) -> None:
        self.text = text


class _FakeResult:
    def __init__(self, content) -> None:
        self.content = content


def _policies_result(policies: list[dict]) -> _FakeResult:
    """Fake Agent Builder CallToolResult: one TextContent block of JSON."""
    return _FakeResult([_FakeContent(json.dumps(policies))])


def test_search_policy_text_calls_elastic(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    async def _fake_call(tool_name, arguments, *, kibana_url=None):
        captured["tool"] = tool_name
        captured["args"] = arguments
        return _policies_result(
            [{"platform": "hilton", "policy_text_full": "Best rate guarantee ..."}]
        )

    monkeypatch.setattr(agent_mod, "call_elastic_mcp_tool", _fake_call)
    out = asyncio.run(agent_mod._search_policy_text("  hilton price match  "))

    assert captured["tool"] == "search_policies"
    # query is trimmed; no limit arg (the Kibana ES|QL hardcodes LIMIT).
    assert captured["args"] == {"query": "hilton price match"}
    assert out == [{"platform": "hilton", "policy_text_full": "Best rate guarantee ..."}]


def test_search_policy_text_empty_query_skips_call(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    async def _fake_call(tool_name, arguments, *, kibana_url=None):
        nonlocal called
        called = True
        return _policies_result([])

    monkeypatch.setattr(agent_mod, "call_elastic_mcp_tool", _fake_call)
    out = asyncio.run(agent_mod._search_policy_text("   "))

    assert out == [{"error": "empty_query"}]
    assert called is False


def test_search_policy_text_search_unavailable_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    leaky_url = "https://kibana.secret.es.io/api/agent_builder/mcp"

    async def _boom(tool_name, arguments, *, kibana_url=None):
        # httpx errors embed the URL in str(exc); the tool must NOT echo it.
        raise RuntimeError(f"Connection refused to {leaky_url}")

    monkeypatch.setattr(agent_mod, "call_elastic_mcp_tool", _boom)
    out = asyncio.run(agent_mod._search_policy_text("hilton"))

    assert out == [{"error": "search_unavailable", "detail": "RuntimeError"}]
    # The Kibana URL must never reach the LLM-facing payload.
    assert leaky_url not in json.dumps(out)


def test_search_policies_fulltext_delegates(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_call(tool_name, arguments, *, kibana_url=None):
        return _policies_result([{"platform": "best_buy"}])

    monkeypatch.setattr(agent_mod, "call_elastic_mcp_tool", _fake_call)
    out = asyncio.run(agent_mod.search_policies_fulltext("best buy exclusions"))
    assert out == [{"platform": "best_buy"}]


def test_search_policy_text_unpacks_agent_builder_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    """Live Agent Builder returns an ES|QL {"results":[{esql_results...}]} envelope,
    not a flat array. The tool must unpack columns+values into row dicts."""
    envelope = {
        "results": [
            {"type": "query", "data": {"esql": "FROM policies-fulltext ..."}},
            {
                "type": "esql_results",
                "data": {
                    "columns": [{"name": "platform"}, {"name": "policy_text_full"}],
                    "values": [["hilton", "Hilton Price Match Guarantee ..."]],
                },
            },
        ]
    }

    async def _fake_call(tool_name, arguments, *, kibana_url=None):
        return _FakeResult([_FakeContent(json.dumps(envelope))])

    monkeypatch.setattr(agent_mod, "call_elastic_mcp_tool", _fake_call)
    out = asyncio.run(agent_mod._search_policy_text("Hilton price match"))
    assert out == [{"platform": "hilton", "policy_text_full": "Hilton Price Match Guarantee ..."}]
