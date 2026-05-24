"""Opt-in end-to-end test for assistant_agent (Plan B direct-Mongo path).

Mirrors the Mode B local-invocation pattern (Runner + InMemorySessionService
in mode_b.py:165-204), but pointed at the deploy-target `assistant_agent`
defined in apps/assistant-agent/src/agent.py. Exercises the full LLM loop:

  user prompt -> Gemini -> tool_call (get_all_purchases_for_user)
  -> ToolContext.user_id injection -> Mongo read -> tool_result
  -> Gemini -> final text_chunk

Three things this catches that scripts/smoke_test_assistant_agent.py can't:
  1. ADK actually wires tool_context.user_id to the session's user_id
     (smoke can't because no Runner is involved).
  2. The model picks the right tool given a natural-language prompt
     (smoke doesn't invoke the model).
  3. The model can use the returned data to compose a sensible final
     response (smoke doesn't see model output).

Skipped automatically when any of the following are not available:
  - GOOGLE_CLOUD_PROJECT env var
  - working ADC (gcloud auth application-default print-access-token)
  - MONGODB_URI env var (fetch with
    `gcloud secrets versions access latest --secret=mongodb-uri` and
    export before running)

Run locally:
    MONGODB_URI=$(gcloud secrets versions access latest --secret=mongodb-uri) \\
      GOOGLE_CLOUD_PROJECT=claimit-beta \\
      pytest apps/assistant-agent/tests/test_e2e_assistant_agent.py -v -s

Not wired into CI — adds quota cost (one Gemini call per test) and
requires creds. Run on-demand when iterating on agent.py or the system
prompt.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest

# ─────────────────────────────────────────────────────────────────────
# Skip gates — evaluated at module import. If any returns a truthy
# reason, the entire module skips. Cheaper than skipping per-test.
# ─────────────────────────────────────────────────────────────────────

_DEMO_EMAIL = "claimitbeta@gmail.com"
_APP_NAME = "claimit-assistant-e2e"
# Real keywords from seed_claims_demo.py — the model's final response
# should mention at least one if it actually summarized the tool output.
_EXPECTED_PURCHASE_KEYWORDS = (
    "Sony",
    "PlayStation",
    "PLAYSTATION",
    "Dyson",
    "Hilton",
    "Best Buy",
    "Amazon",
)


def _adc_works() -> bool:
    """Return True iff `gcloud auth application-default print-access-token`
    returns a non-empty token. The token isn't used here — its presence
    means Vertex AI calls will authenticate.

    Uses the absolute path returned by shutil.which() because on Windows
    `gcloud` resolves to `gcloud.CMD`, and `subprocess.run(["gcloud", ...])`
    without shell=True does not auto-resolve .CMD extensions — it raises
    FileNotFoundError. Passing the full path bypasses that quirk and
    keeps shell=False (safer / portable)."""
    gcloud = shutil.which("gcloud")
    if gcloud is None:
        return False
    try:
        result = subprocess.run(
            [gcloud, "auth", "application-default", "print-access-token"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except Exception:
        return False
    return result.returncode == 0 and bool(result.stdout.strip())


_skip_reason: str | None = None
if not os.environ.get("GOOGLE_CLOUD_PROJECT"):
    _skip_reason = "GOOGLE_CLOUD_PROJECT not set"
elif not os.environ.get("MONGODB_URI"):
    _skip_reason = (
        "MONGODB_URI not set — export it via "
        "`gcloud secrets versions access latest --secret=mongodb-uri`"
    )
elif not _adc_works():
    _skip_reason = "ADC unavailable — run `gcloud auth application-default login`"

# Point google.genai at Vertex AI instead of the public Gemini API. Without
# these, the genai client defaults to "I need an API key" mode (infra/
# terraform/main.tf:178-187 wires the same two vars on Cloud Run services).
# Set defaults rather than overwriting so a caller can target a different
# region by exporting GOOGLE_CLOUD_LOCATION ahead of pytest.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-east1")

pytestmark = pytest.mark.skipif(_skip_reason is not None, reason=_skip_reason or "")


# ─────────────────────────────────────────────────────────────────────
# Module fixtures
# ─────────────────────────────────────────────────────────────────────


def _load_agent_module() -> Any:
    """Load apps/assistant-agent/src/agent.py via spec_from_file_location,
    matching how deploy_agents.py imports the deploy target. Mirrors the
    same loader so the test exercises the actual deploy entry point, not
    a parallel implementation that could drift."""
    repo_root = Path(__file__).resolve().parents[3]
    agent_path = repo_root / "apps" / "assistant-agent" / "src" / "agent.py"
    spec = importlib.util.spec_from_file_location("agent_e2e_module", str(agent_path))
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def agent_module() -> Any:
    """The freshly-loaded deploy agent module."""
    return _load_agent_module()


@pytest.fixture(scope="module")
async def demo_user_id(agent_module: Any) -> str:
    """Resolve the seed demo user's UUID by email (see
    scripts/seed_claims_demo.py:1223-1238 for the same lookup pattern).

    Module-scoped so the lookup runs once per test session. We use the
    raw motor collection because `MongoDBClient.find_one` requires
    a Pydantic model class, and the seed `User` model lives in the
    shared models package which we're already importing transitively
    via agent.py. Keeps the lookup uniform with the seed script."""
    client = agent_module.MongoDBClient()
    try:
        doc = await client._db["users"].find_one({"email": _DEMO_EMAIL})
        if not doc:
            pytest.skip(f"Demo user {_DEMO_EMAIL} not found in Mongo (run seed_claims_demo first)")
        uid_raw = doc["_id"]
        uid = uid_raw if isinstance(uid_raw, UUID) else UUID(str(uid_raw))
        return str(uid)
    finally:
        await client.close()


# ─────────────────────────────────────────────────────────────────────
# E2E runner — shared helper that drives the agent and collects events
# ─────────────────────────────────────────────────────────────────────


async def _run_agent(agent_module: Any, user_id: str, message: str) -> list[dict[str, Any]]:
    """Drive `agent_module.assistant_agent` through one user turn.

    Returns a flat list of event records: {kind, name, args, response, text}
    where unused fields are None. Caller asserts shape.
    """
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    session_service = InMemorySessionService()
    session_id = f"e2e-{uuid4()}"
    # InMemorySessionService.create_session is sync in some ADK versions
    # and async in others; mirror mode_b._maybe_await behavior inline
    # rather than importing private mode_b internals.
    maybe_coro = session_service.create_session(
        app_name=_APP_NAME, user_id=user_id, session_id=session_id
    )
    if hasattr(maybe_coro, "__await__"):
        await maybe_coro

    runner = Runner(
        app_name=_APP_NAME,
        agent=agent_module.assistant_agent,
        session_service=session_service,
    )
    new_message = types.Content(role="user", parts=[types.Part.from_text(text=message)])

    events: list[dict[str, Any]] = []
    async for event in runner.run_async(
        user_id=user_id, session_id=session_id, new_message=new_message
    ):
        content = getattr(event, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            text = getattr(part, "text", None)
            if text:
                events.append({"kind": "text", "text": text})
                continue
            fc = getattr(part, "function_call", None)
            if fc is not None:
                events.append(
                    {
                        "kind": "tool_call",
                        "name": getattr(fc, "name", None),
                        "args": dict(getattr(fc, "args", {}) or {}),
                    }
                )
                continue
            fr = getattr(part, "function_response", None)
            if fr is not None:
                events.append(
                    {
                        "kind": "tool_result",
                        "name": getattr(fr, "name", None),
                        "response": getattr(fr, "response", None),
                    }
                )
    return events


# ─────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_llm_invokes_get_all_purchases_for_user(agent_module: Any, demo_user_id: str) -> None:
    """Prompt the assistant naturally and confirm the model picked the
    tool (no user_id leaked through args — ADK should strip tool_context
    from the LLM-facing declaration)."""
    events = await _run_agent(agent_module, demo_user_id, "what purchases do I have?")

    tool_calls = [e for e in events if e["kind"] == "tool_call"]
    assert tool_calls, f"Model did not call any tool. Events: {events}"
    names = [e["name"] for e in tool_calls]
    assert "get_all_purchases_for_user" in names, f"Wrong tool called: {names}"

    purchases_call = next(e for e in tool_calls if e["name"] == "get_all_purchases_for_user")
    # The LLM-facing declaration must NOT include user_id (it comes from
    # tool_context). If the model passes it, ADK leaked the parameter.
    assert "user_id" not in purchases_call["args"], (
        f"LLM supplied user_id explicitly — declaration leaked tool_context: {purchases_call['args']}"
    )


@pytest.mark.asyncio
async def test_tool_returns_purchases_for_demo_user(agent_module: Any, demo_user_id: str) -> None:
    """The tool result should be a non-empty list of purchase docs.
    Confirms ToolContext.user_id reached the helper AND Mongo returned
    real data for the seed user."""
    events = await _run_agent(agent_module, demo_user_id, "list my purchases please")

    tool_results = [
        e
        for e in events
        if e["kind"] == "tool_result" and e["name"] == "get_all_purchases_for_user"
    ]
    assert tool_results, f"No tool_result for get_all_purchases_for_user. Events: {events}"

    response = tool_results[0]["response"]
    # ADK wraps the tool's return value. Common shapes: {"result": [...]} or the list directly.
    payload = response.get("result", response) if isinstance(response, dict) else response
    assert isinstance(payload, list), (
        f"Expected list payload, got {type(payload).__name__}: {payload!r}"
    )
    assert payload, "Demo user has zero purchases — seed data missing or filter wrong"

    first = payload[0]
    assert isinstance(first, dict), f"Expected dict items, got {type(first).__name__}"
    # Sanity that this is a Purchase doc, not an error payload.
    assert "error" not in first, f"Tool returned error: {first}"


@pytest.mark.asyncio
async def test_final_response_mentions_purchase_data(agent_module: Any, demo_user_id: str) -> None:
    """The model should weave at least one real purchase keyword into
    its final reply. Lenient match — model phrasing varies turn-to-turn
    but the seed data has these distinctive product/platform names."""
    events = await _run_agent(agent_module, demo_user_id, "tell me about my purchases")

    text_blob = "".join(e["text"] for e in events if e["kind"] == "text")
    assert text_blob, f"Model produced no text response. Events: {events}"

    found = [kw for kw in _EXPECTED_PURCHASE_KEYWORDS if kw.lower() in text_blob.lower()]
    assert found, (
        f"Final response mentions none of {_EXPECTED_PURCHASE_KEYWORDS}. "
        f"Text was: {text_blob[:600]!r}"
    )
