#!/usr/bin/env python3
"""Throwaway probe: Elastic policy search + ADK Agent with search_policies tool.

Part (a): direct get_search_adapter().search_policies(...) call.
Part (b): minimal Agent + FunctionTool(search_policies) + Runner, one turn.

Required env:
    GOOGLE_CLOUD_PROJECT      e.g. claimit-beta
    GOOGLE_CLOUD_LOCATION     e.g. us-east1
    GOOGLE_GENAI_USE_VERTEXAI true
    ELASTIC_URL               from Secret Manager secret elastic-url
    ELASTIC_API_KEY           from Secret Manager secret elastic-api-key

Usage (from repo root):

    export GOOGLE_CLOUD_PROJECT=claimit-beta
    export GOOGLE_CLOUD_LOCATION=us-east1
    export GOOGLE_GENAI_USE_VERTEXAI=true
    export ELASTIC_URL="$(gcloud secrets versions access latest \\
        --secret=elastic-url --project=claimit-beta)"
    export ELASTIC_API_KEY="$(gcloud secrets versions access latest \\
        --secret=elastic-api-key --project=claimit-beta)"
    uv run --project apps/assistant-agent python scripts/probe_policy_tool.py
"""

from __future__ import annotations

import asyncio
import inspect
import json
import os
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "assistant-agent"))

from google.adk import Agent  # noqa: E402
from google.adk.runners import Runner  # noqa: E402
from google.adk.sessions import InMemorySessionService  # noqa: E402
from google.adk.tools import FunctionTool  # noqa: E402
from google.genai import types  # noqa: E402
from search import get_search_adapter  # noqa: E402
from src.mode_a import MODE_A_SYSTEM_PROMPT  # noqa: E402
from src.tools.search_tools import search_policies  # noqa: E402

_APP_NAME = "claimit-probe-policy-tool"
_MODEL_NAME = "gemini-2.5-flash"
_DIRECT_QUERY = "Hilton best rate guarantee"
_AGENT_MESSAGE = "How does Hilton's BRG policy work?"
_SNIPPET_LEN = 200


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"ERROR: {name} environment variable is required.", file=sys.stderr)
        sys.exit(1)
    return value


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _policy_snippet(doc: dict[str, Any]) -> str:
    platform = doc.get("platform", "?")
    body = (
        doc.get("policy_text_relevant_clause")
        or doc.get("policy_text_full")
        or json.dumps(doc, default=str)
    )
    text = str(body).replace("\n", " ").strip()
    if len(text) > _SNIPPET_LEN:
        text = text[:_SNIPPET_LEN] + "…"
    return f"[{platform}] {text}"


def _collect_text(event: Any) -> str:
    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) or []
    chunks: list[str] = []
    for part in parts:
        text = getattr(part, "text", None)
        if text:
            chunks.append(text)
    return "".join(chunks)


async def _probe_direct_search() -> None:
    print("=== (a) get_search_adapter().search_policies ===")
    adapter = get_search_adapter()
    try:
        hits = await adapter.search_policies(_DIRECT_QUERY, limit=5)
    finally:
        await adapter.close()

    print(f"Query: {_DIRECT_QUERY!r}")
    print(f"Hits: {len(hits)}")
    for i, doc in enumerate(hits, start=1):
        print(f"  {i}. {_policy_snippet(doc)}")


async def _probe_agent_with_tool() -> None:
    print("\n=== (b) Agent + FunctionTool(search_policies) ===")

    user_id = "probe-user"
    session_service = InMemorySessionService()
    session_id = f"probe-{uuid4()}"
    await _maybe_await(
        session_service.create_session(
            app_name=_APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
    )

    agent = Agent(
        name="probe_policy",
        model=_MODEL_NAME,
        instruction=MODE_A_SYSTEM_PROMPT,
        tools=[FunctionTool(search_policies)],
    )
    runner = Runner(
        app_name=_APP_NAME,
        agent=agent,
        session_service=session_service,
    )
    new_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=_AGENT_MESSAGE)],
    )

    final_text = ""
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=new_message,
    ):
        text = _collect_text(event)
        if text and hasattr(event, "is_final_response") and event.is_final_response():
            final_text = text

    print(f"Prompt: {_AGENT_MESSAGE!r}")
    print("Final assistant text:")
    print(final_text.strip() if final_text.strip() else "(empty — check tool-call trace above)")


async def _run() -> int:
    _require_env("GOOGLE_CLOUD_PROJECT")
    _require_env("GOOGLE_CLOUD_LOCATION")
    _require_env("ELASTIC_URL")
    _require_env("ELASTIC_API_KEY")
    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() not in {"1", "true", "yes"}:
        print(
            "ERROR: GOOGLE_GENAI_USE_VERTEXAI must be true for Vertex-backed Gemini.",
            file=sys.stderr,
        )
        return 1

    await _probe_direct_search()
    await _probe_agent_with_tool()
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(_run()))


if __name__ == "__main__":
    main()
