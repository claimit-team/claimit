#!/usr/bin/env python3
"""Throwaway probe: ADK Runner + StreamingMode.SSE partial vs cumulative events.

Mirrors mode_a.handle_message session/runner setup (InMemorySessionService,
Runner.run_async) but uses a toolless Agent so the run is LLM-only.

Required env (Vertex via ADC — run `gcloud auth application-default login`):
    GOOGLE_CLOUD_PROJECT      e.g. claimit-beta
    GOOGLE_CLOUD_LOCATION     e.g. us-east1
    GOOGLE_GENAI_USE_VERTEXAI true

Usage (from repo root):

    export GOOGLE_CLOUD_PROJECT=claimit-beta
    export GOOGLE_CLOUD_LOCATION=us-east1
    export GOOGLE_GENAI_USE_VERTEXAI=true
    uv run --project apps/assistant-agent python scripts/probe_streaming.py
"""

from __future__ import annotations

import asyncio
import inspect
import os
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "assistant-agent"))

from google.adk import Agent  # noqa: E402
from google.adk.agents.run_config import RunConfig, StreamingMode  # noqa: E402
from google.adk.runners import Runner  # noqa: E402
from google.adk.sessions import InMemorySessionService  # noqa: E402
from google.genai import types  # noqa: E402
from src.mode_a import MODE_A_SYSTEM_PROMPT  # noqa: E402

_APP_NAME = "claimit-probe-streaming"
_MODEL_NAME = "gemini-2.5-flash"
_PROBE_MESSAGE = "Explain in 4 sentences how a price-match refund works."


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


def _text_preview(event: Any, max_len: int = 80) -> str:
    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) or []
    for part in parts:
        text = getattr(part, "text", None)
        if text:
            return text[:max_len] + ("…" if len(text) > max_len else "")
    return "(no text part)"


def _is_final(event: Any) -> bool:
    if hasattr(event, "is_final_response"):
        try:
            return bool(event.is_final_response())
        except Exception:
            return False
    return False


async def _run() -> int:
    _require_env("GOOGLE_CLOUD_PROJECT")
    _require_env("GOOGLE_CLOUD_LOCATION")
    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() not in {"1", "true", "yes"}:
        print(
            "ERROR: GOOGLE_GENAI_USE_VERTEXAI must be true for Vertex-backed Gemini.",
            file=sys.stderr,
        )
        return 1

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
        name="probe",
        model=_MODEL_NAME,
        instruction=MODE_A_SYSTEM_PROMPT,
    )
    runner = Runner(
        app_name=_APP_NAME,
        agent=agent,
        session_service=session_service,
    )
    new_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=_PROBE_MESSAGE)],
    )
    run_config = RunConfig(streaming_mode=StreamingMode.SSE)

    print(f"Prompt: {_PROBE_MESSAGE!r}")
    print(f"RunConfig: streaming_mode={run_config.streaming_mode!r}\n")

    event_idx = 0
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=new_message,
        run_config=run_config,
    ):
        event_idx += 1
        partial = getattr(event, "partial", None)
        final = _is_final(event)
        preview = _text_preview(event)
        print(
            f"[event {event_idx:02d}] partial={partial!r} "
            f"is_final_response()={final!r} text[:80]={preview!r}"
        )

    print(f"\nTotal events: {event_idx}")
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(_run()))


if __name__ == "__main__":
    main()
