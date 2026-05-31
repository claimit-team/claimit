"""Phoenix MCP toolset + reader for ClaimIt ADK agents.

The read side of Phoenix at runtime, via the `@arizeai/phoenix-mcp` server
hosted behind a stdio->HTTP `supergateway` bridge on Cloud Run (Agent Engine
has no Node.js, and phoenix-mcp is stdio-only). Mirrors `mongodb.py`:

- **streamable HTTP** (Agent Engine + Cloud Run production path): when
  `PHOENIX_MCP_URL` is set, connect over MCP Streamable HTTP to the Cloud Run
  bridge, authenticated with a Google OIDC ID token (audience = bare service
  URL). Reuses `mongodb._build_oidc_client_factory` (the request-event-hook
  OIDC fix) so both MCP integrations authenticate identically.
- **stdio** (local-dev): when `PHOENIX_MCP_URL` is unset, spawn
  `npx @arizeai/phoenix-mcp@latest` as a child, passing `--baseUrl`/`--apiKey`
  from `PHOENIX_BASE_URL`/`PHOENIX_API_KEY`.

This module replaces the hand-rolled `claimit_observability.phoenix_client`
(the `phoenix.client.AsyncClient` reader). `claimit_observability` keeps only
the *write* side (`init_phoenix` / OTLP export); the *read* side now goes
through a real MCP call.

phoenix-mcp `get-spans` constraint: it has NO arbitrary span-attribute filter
(params: project_identifier, start_time, end_time, trace_ids, parent_id,
names, span_kinds, status_codes, cursor, limit, include_annotations). It
cannot filter by the `claim.id` attribute server-side the way the old
phoenix.client reader did. So `read_claim_reasoning_spans` filters by span
`names` server-side to bound the payload, then filters by the `claim.id`
attribute CLIENT-SIDE. The client-side filter doubles as a tenancy backstop.
"""

from __future__ import annotations

import ast
import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
    StreamableHTTPConnectionParams,
)
from mcp import StdioServerParameters

# Reuse the MongoDB MCP transport primitives so both servers authenticate and
# frame requests identically: `_MCP_HTTP_PATH` is the "/mcp" suffix appended to
# the bare service URL, `_build_oidc_client_factory` installs the request event
# hook that attaches a fresh OIDC bearer (the Agent-Engine httpx stack ignores
# client-level `auth=`), and `extract_tool_documents` parses TextContent JSON.
from .mongodb import (
    _HTTP_CONNECT_TIMEOUT_SECONDS,
    _HTTP_READ_TIMEOUT_SECONDS,
    _MCP_HTTP_PATH,
    _build_oidc_client_factory,
    extract_tool_documents,
)

logger = logging.getLogger(__name__)

QueryStatus = Literal["ok", "pending", "timeout", "unavailable"]

# Inner per-call budget for the MCP round-trip. Higher than the old in-process
# phoenix.client read (1.5s) because this path is agent -> Cloud Run
# supergateway -> stdio phoenix-mcp -> Phoenix API, plus an OIDC mint on cold
# connections and an MCP `initialize` handshake. Keep this strictly below the
# caller's outer budget (claim_tools._REASONING_TRACE_TIMEOUT_SECONDS) so a
# slow Phoenix yields a graceful status="timeout" rather than tripping the
# outer wrapper.
_DEFAULT_TIMEOUT_SECONDS = 4.0
_DEFAULT_PROJECT = "default"

# Span names claim-agent emits that the reasoning-trace aggregator consumes.
# Used as the get-spans `names` server-side filter to bound the payload, since
# `claim.id` cannot be filtered server-side via phoenix-mcp.
_REASONING_SPAN_NAMES = ["validator.validate", "self_evaluate.evaluate"]

# The MCP tool name phoenix-mcp registers for span retrieval.
_GET_SPANS_TOOL = "get-spans"


@dataclass(frozen=True)
class SpanRecord:
    """A single span pulled from Phoenix, normalized for the aggregator."""

    name: str
    attributes: dict[str, Any]
    start_time: datetime | None
    end_time: datetime | None
    status_code: str


@dataclass(frozen=True)
class QueryResult:
    """Discriminated result so the caller doesn't have to catch exceptions
    to know whether Phoenix was reachable."""

    status: QueryStatus
    spans: list[SpanRecord] = field(default_factory=list)


def get_phoenix_mcp_toolset() -> McpToolset:
    """Phoenix MCP toolset factory — picks transport from env.

    - When `PHOENIX_MCP_URL` is set: a Streamable-HTTP toolset pointed at the
      Cloud Run supergateway bridge, OIDC-authenticated (audience = the URL).
    - Otherwise: the stdio toolset that spawns `npx @arizeai/phoenix-mcp@latest`,
      reading `--baseUrl`/`--apiKey` from `PHOENIX_BASE_URL`/`PHOENIX_API_KEY`.

    Note: agents do NOT register this raw toolset (Gemini function-calling
    rejects rich MCP tool schemas). They register thin `FunctionTool`s that
    call `call_phoenix_mcp_tool` instead. This factory exists for parity with
    `get_mongodb_mcp_toolset` and for local/manual use.
    """
    mcp_url = os.environ.get("PHOENIX_MCP_URL", "").strip()
    if mcp_url:
        return _http_toolset(mcp_url)
    return _stdio_toolset()


def _http_toolset(mcp_url: str) -> McpToolset:
    """Build a Streamable-HTTP Phoenix MCP toolset with OIDC auth.

    Audience is the bare service URL (no `/mcp`); the path is appended only for
    the client connection URL — identical to the MongoDB MCP convention.
    """
    audience = mcp_url.rstrip("/")
    connection_url = f"{audience}{_MCP_HTTP_PATH}"
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=connection_url,
            timeout=_HTTP_CONNECT_TIMEOUT_SECONDS,
            sse_read_timeout=_HTTP_READ_TIMEOUT_SECONDS,
            httpx_client_factory=_build_oidc_client_factory(audience),
        ),
    )


def _stdio_toolset() -> McpToolset:
    """Build the local-dev stdio toolset (npx child process).

    Passes `--baseUrl`/`--apiKey` from the inherited environment so a local
    developer with Node + a Phoenix key can exercise the same tool surface.
    """
    base_url = os.environ.get("PHOENIX_BASE_URL", "")
    api_key = os.environ.get("PHOENIX_API_KEY", "")
    args = ["-y", "@arizeai/phoenix-mcp@latest"]
    if base_url:
        args += ["--baseUrl", base_url]
    if api_key:
        args += ["--apiKey", api_key]
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command="npx",
                args=args,
                env=None,
            ),
            timeout=30,
        ),
    )


async def call_phoenix_mcp_tool(
    tool_name: str,
    arguments: dict,
    *,
    mcp_url: str | None = None,
):
    """Open an authenticated Streamable-HTTP MCP session and invoke ONE tool.

    The Gemini-friendly runtime path (mirrors `mongodb.call_mongodb_mcp_tool`):
    a thin ADK `FunctionTool` with a clean schema calls this helper so a real
    Phoenix MCP tool executes at runtime while the model only sees the wrapper.

    Auth reuses `_build_oidc_client_factory` (the event-hook OIDC fix). Reads
    the target service from `PHOENIX_MCP_URL` unless `mcp_url` is given.

    Returns the raw mcp `CallToolResult`; use `extract_tool_documents` /
    `summarize_recent_spans` to parse it.
    """
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    resolved = (mcp_url or os.environ.get("PHOENIX_MCP_URL", "")).strip()
    if not resolved:
        raise RuntimeError("PHOENIX_MCP_URL not set; Phoenix MCP HTTP transport unavailable")
    audience = resolved.rstrip("/")
    url = f"{audience}{_MCP_HTTP_PATH}"
    factory = _build_oidc_client_factory(audience)
    async with (
        streamablehttp_client(url=url, httpx_client_factory=factory) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        return await session.call_tool(tool_name, arguments)


# ---------------------------------------------------------------------------
# Span parsing helpers (ported from the retired phoenix_client.py + extended
# to flatten phoenix-mcp's span JSON and filter claim.id client-side).
# ---------------------------------------------------------------------------


def _maybe_parse_listish(value: Any) -> Any:
    """Parse a stringified Python list/tuple back to a real list.

    claim-agent's validator/self_evaluate emit some attributes as
    `str(some_list)` (OTel forbids container attribute values). The aggregator
    needs the real list; without this the LLM gets a stringified blob.
    """
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not (stripped.startswith("[") and stripped.endswith("]")):
        return value
    try:
        parsed = ast.literal_eval(stripped)
    except (ValueError, SyntaxError):
        return value
    if isinstance(parsed, (list, tuple)):
        return list(parsed)
    return value


def _parse_iso(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _flatten_attributes(attrs: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten a possibly-nested attributes object into dotted keys.

    phoenix-mcp may return span attributes either already flat
    (`{"claim.id": "..."}`) or nested OpenInference-style
    (`{"claim": {"id": "..."}}`). Both collapse to `{"claim.id": "..."}` so
    the `claim.id` lookup works regardless of shape.
    """
    out: dict[str, Any] = {}
    if not isinstance(attrs, dict):
        return out
    for key, value in attrs.items():
        dotted = f"{prefix}{key}"
        if isinstance(value, dict):
            out.update(_flatten_attributes(value, prefix=f"{dotted}."))
        else:
            out[dotted] = value
    return out


def _result_to_span_dicts(result: Any) -> list[dict[str, Any]]:
    """Best-effort parse of a get-spans `CallToolResult` into span dicts.

    Tolerates the likely phoenix-mcp shapes: a top-level list of spans, a dict
    with a `"spans"` (or `"data"`) array, or a single span dict.
    """
    spans: list[dict[str, Any]] = []
    for doc in extract_tool_documents(result):
        if not isinstance(doc, dict):
            continue
        inner = doc.get("spans") or doc.get("data")
        if isinstance(inner, list):
            spans.extend(s for s in inner if isinstance(s, dict))
        elif "text" in doc and len(doc) == 1:
            # extract_tool_documents wrapped an unparseable text blob — skip.
            continue
        else:
            spans.append(doc)
    return spans


def _to_record(span: dict[str, Any]) -> SpanRecord:
    raw_attrs = _flatten_attributes(span.get("attributes") or span.get("context_attributes") or {})
    attrs = {k: _maybe_parse_listish(v) for k, v in raw_attrs.items()}
    return SpanRecord(
        name=str(span.get("name") or span.get("span_name") or ""),
        attributes=attrs,
        start_time=_parse_iso(span.get("start_time")),
        end_time=_parse_iso(span.get("end_time")),
        status_code=str(span.get("status_code") or span.get("status") or ""),
    )


def _records_for_claim(result: Any, claim_id: str) -> list[SpanRecord]:
    """Parse get-spans output and keep only spans whose `claim.id` matches.

    The client-side `claim.id` filter is required because phoenix-mcp's
    `get-spans` has no attribute filter — and it doubles as a tenancy backstop
    so even an over-broad server response only surfaces the closure-bound
    claim's spans.
    """
    records: list[SpanRecord] = []
    for span in _result_to_span_dicts(result):
        record = _to_record(span)
        if str(record.attributes.get("claim.id")) == str(claim_id):
            records.append(record)
    return records


async def read_claim_reasoning_spans(
    claim_id: str,
    *,
    timeout: float = _DEFAULT_TIMEOUT_SECONDS,
    project_identifier: str | None = None,
    limit: int = 1000,
) -> QueryResult:
    """MCP equivalent of the retired `query_claim_spans`.

    Same return contract `claim_tools.make_get_reasoning_trace` depends on:
    `QueryResult(status ∈ {ok,pending,timeout,unavailable}, spans:list[SpanRecord])`.

    - `PHOENIX_MCP_URL` unset -> "unavailable"
    - call exceeds `timeout`  -> "timeout"
    - zero matching spans     -> "pending"
    - else                    -> "ok"

    Fetches with a server-side span-`names` filter (validator/self-eval) to
    bound the payload, then filters `claim.id` client-side (see module docstring).
    """
    if not os.environ.get("PHOENIX_MCP_URL", "").strip():
        return QueryResult(status="unavailable")

    project = project_identifier or os.environ.get("PHOENIX_PROJECT_NAME") or _DEFAULT_PROJECT
    args: dict[str, Any] = {
        "project_identifier": project,
        "names": _REASONING_SPAN_NAMES,
        "limit": limit,
    }

    try:
        result = await asyncio.wait_for(
            call_phoenix_mcp_tool(_GET_SPANS_TOOL, args), timeout=timeout
        )
    except TimeoutError:
        logger.warning(
            "Phoenix MCP get-spans timed out claim_id=%s timeout=%.2fs", claim_id, timeout
        )
        return QueryResult(status="timeout")
    except Exception:
        # Best-effort context — never let a query failure break the turn.
        logger.exception("Phoenix MCP get-spans failed claim_id=%s", claim_id)
        return QueryResult(status="unavailable")

    records = _records_for_claim(result, claim_id)
    if not records:
        return QueryResult(status="pending")
    return QueryResult(status="ok", spans=records)


def summarize_recent_spans(result: Any) -> list[dict[str, Any]]:
    """Sanitized, NON-content summary of a get-spans result: counts grouped by
    (span name, status code), with span attributes STRIPPED.

    Span attributes carry prompt/response content (claim drafts, policy text),
    which is cross-user data. A user-driven LLM tool must never return that, so
    this helper — shared by every agent's `get_recent_trace_summary` tool —
    returns only operation names + statuses + counts. The sanitization lives
    here, in one reviewed place, rather than copy-pasted into four agents.
    """
    counts: dict[tuple[str, str], int] = {}
    for span in _result_to_span_dicts(result):
        name = str(span.get("name") or span.get("span_name") or "unknown")
        status = str(span.get("status_code") or span.get("status") or "")
        key = (name, status)
        counts[key] = counts.get(key, 0) + 1
    return [
        {"span_name": name, "status_code": status, "count": count}
        for (name, status), count in sorted(counts.items())
    ]
