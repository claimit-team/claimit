"""Phoenix query helper — read spans back out of Phoenix for the Assistant.

`init_phoenix` (phoenix.py) handles the *write* side: OTLP export of OTel
spans up to Arize Phoenix. This module handles the *read* side: pulling
those spans back so Assistant Mode B can answer "why did the validator
reject the first draft" with the actual `validator.validate` span
attributes rather than confabulating from claim doc fields.

Why a separate module:
- `init_phoenix` runs at app startup and may no-op if no API key is set;
  the read path needs a separate idempotent path with its own degradation
  story (Phoenix unreachable / spans not yet exported / API key missing
  in dev all map to graceful fallback, not crashes).
- The query API base URL on Phoenix Cloud is the root host (e.g.
  https://app.phoenix.arize.com), not the OTLP collector path
  (.../v1/traces). They are configured via separate env vars on purpose.

Behaviour summary:
- `query_claim_spans(claim_id)` filters server-side on `claim.id` attribute,
  returning a small list of `SpanRecord` plus a `status` discriminator.
- If `PHOENIX_API_KEY` or `PHOENIX_BASE_URL` is unset → `status="unavailable"`.
- If the call exceeds `timeout` seconds → `status="timeout"`.
- If the server returns zero spans → `status="pending"` (BatchSpanProcessor
  has a 5s default schedule_delay; a user opening Mode B seconds after
  draft completion will see this state until spans drain).
- Otherwise → `status="ok"` with the parsed span list.

The caller (`make_get_reasoning_trace`) is expected to surface
`phoenix_query_status` to the LLM so the model can degrade gracefully.
"""

from __future__ import annotations

import ast
import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from phoenix.client import AsyncClient

logger = logging.getLogger(__name__)

QueryStatus = Literal["ok", "pending", "timeout", "unavailable"]

_DEFAULT_PROJECT = "default"
_DEFAULT_TIMEOUT_SECONDS = 1.5


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


_client: AsyncClient | None = None


def _get_client() -> AsyncClient | None:
    """Return a cached AsyncClient bound to the configured Phoenix endpoint,
    or None if env vars are unset.

    The client wraps httpx.AsyncClient, which is designed to be reused.
    Creating a new one per call would re-establish HTTP connections and
    erode the 2s demo budget."""
    global _client
    if _client is not None:
        return _client

    api_key = os.environ.get("PHOENIX_API_KEY")
    base_url = os.environ.get("PHOENIX_BASE_URL")
    if not api_key or not base_url:
        return None

    _client = AsyncClient(base_url=base_url, api_key=api_key)
    return _client


def _maybe_parse_listish(value: Any) -> Any:
    """If `value` is a string that looks like a stringified Python list/tuple,
    parse it back to a real list. Otherwise return as-is.

    claim-agent's validator and self_evaluate emit a few attributes as
    `str(some_list)` (e.g. `"['placeholder', 'order_id']"`) because OTel's
    attribute spec doesn't allow arbitrary container values. The assistant
    needs the real list to format a useful explanation; without this the
    LLM gets a stringified blob and can produce odd outputs."""
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


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _to_record(span: dict[str, Any]) -> SpanRecord:
    raw_attrs = dict(span.get("attributes") or {})
    attrs = {k: _maybe_parse_listish(v) for k, v in raw_attrs.items()}
    return SpanRecord(
        name=str(span.get("name") or ""),
        attributes=attrs,
        start_time=_parse_iso(span.get("start_time")),
        end_time=_parse_iso(span.get("end_time")),
        status_code=str(span.get("status_code") or ""),
    )


async def query_claim_spans(
    claim_id: str,
    *,
    timeout: float = _DEFAULT_TIMEOUT_SECONDS,
    project_identifier: str | None = None,
    limit: int = 100,
) -> QueryResult:
    """Fetch spans tagged with `claim.id == claim_id` from Phoenix.

    Args:
        claim_id: The claim's UUID (string form). Filtered server-side via
            the spans REST API's `attribute` query param.
        timeout: Hard timeout enforced via `asyncio.wait_for`. The Phoenix
            client's own timeout doesn't apply uniformly to all paths;
            wrapping at the asyncio level catches connection hangs too.
        project_identifier: Phoenix project name. Defaults to the
            `PHOENIX_PROJECT_NAME` env var, or "default" if unset.
        limit: Max spans to fetch. 100 is well above the largest expected
            trace (claim-agent emits ~10 spans per claim).
    """
    client = _get_client()
    if client is None:
        return QueryResult(status="unavailable")

    project = project_identifier or os.environ.get("PHOENIX_PROJECT_NAME") or _DEFAULT_PROJECT

    try:
        spans = await asyncio.wait_for(
            client.spans.get_spans(
                project_identifier=project,
                attributes={"claim.id": claim_id},
                limit=limit,
            ),
            timeout=timeout,
        )
    except TimeoutError:
        logger.warning("Phoenix span query timed out claim_id=%s timeout=%.2fs", claim_id, timeout)
        return QueryResult(status="timeout")
    except Exception:
        # Phoenix is best-effort context for the user; never let a query
        # failure break the assistant turn. The caller falls back to
        # claim-doc fields when status != "ok".
        logger.exception("Phoenix span query failed claim_id=%s", claim_id)
        return QueryResult(status="unavailable")

    if not spans:
        return QueryResult(status="pending")

    records = [_to_record(dict(s)) for s in spans]
    return QueryResult(status="ok", spans=records)


def _reset_client_for_tests() -> None:
    """Test hook: clear the cached client so a test can re-init under
    different env vars. Not part of the public API."""
    global _client
    _client = None
