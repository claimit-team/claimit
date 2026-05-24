#!/usr/bin/env python3
"""Throwaway probe: raw Vertex Agent Engine event shape for Mode A + SSE.

Mirrors api-gateway conversation_service setup:
  - CLAIMIT_ASSISTANT_AGENT_ID from os.environ (Secret Manager in prod)
  - vertexai.init(project, location) parsed from the resource name
  - async_stream_query(..., run_config={"streaming_mode": "sse"})

Required env:
    CLAIMIT_ASSISTANT_AGENT_ID  full reasoningEngines resource name
                                (prod: Secret Manager secret claimit-assistant-agent-id)

ADC (one-time): gcloud auth application-default login

Export the agent id (same source as api-gateway Cloud Run):

    export CLAIMIT_ASSISTANT_AGENT_ID="$(gcloud secrets versions access latest \\
        --secret=claimit-assistant-agent-id --project=claimit-beta)"

Usage (from repo root):

    uv run --project apps/api-gateway python scripts/probe_modea_shape.py
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from typing import Any

import vertexai
import vertexai.agent_engines

_RESOURCE_NAME_RE = re.compile(
    r"^projects/(?P<project>[^/]+)/locations/(?P<location>[^/]+)/reasoningEngines/"
)
_PROBE_MESSAGE = "Explain in 4 sentences how a price-match refund works."
_PROBE_USER_ID = "probe"


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"ERROR: {name} environment variable is required.", file=sys.stderr)
        print(
            "Export via:\n"
            '  export CLAIMIT_ASSISTANT_AGENT_ID="$(gcloud secrets versions access latest '
            '--secret=claimit-assistant-agent-id --project=claimit-beta)"',
            file=sys.stderr,
        )
        sys.exit(1)
    return value


def _init_vertexai_from_resource_name(resource_name: str) -> None:
    match = _RESOURCE_NAME_RE.match(resource_name)
    if match:
        vertexai.init(project=match["project"], location=match["location"])
    else:
        print(
            f"WARNING: resource name does not match expected shape: {resource_name!r}",
            file=sys.stderr,
        )


def _extract_text(event: Any) -> str | None:
    if isinstance(event, dict):
        parts = (event.get("content") or {}).get("parts") or []
        for part in parts:
            if isinstance(part, dict):
                text = part.get("text")
                if text:
                    return str(text)
        return None

    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) or []
    for part in parts:
        text = getattr(part, "text", None)
        if text:
            return str(text)
    return None


def _partial_value(event: Any) -> Any:
    if isinstance(event, dict):
        return event.get("partial", "<missing>")
    return getattr(event, "partial", "<missing>")


def _preview(text: str | None, max_len: int = 120) -> str:
    if text is None:
        return "(no text)"
    one_line = text.replace("\n", "\\n")
    if len(one_line) > max_len:
        return one_line[:max_len] + "…"
    return one_line


async def _run() -> int:
    resource_name = _require_env("CLAIMIT_ASSISTANT_AGENT_ID")
    _init_vertexai_from_resource_name(resource_name)

    print(f"Resource: {resource_name}")
    print(f"Prompt: {_PROBE_MESSAGE!r}")
    print("run_config: {'streaming_mode': 'sse'}\n")

    remote_agent = vertexai.agent_engines.get(resource_name=resource_name)

    event_idx = 0
    texts: list[str] = []
    async for event in remote_agent.async_stream_query(
        message=_PROBE_MESSAGE,
        user_id=_PROBE_USER_ID,
        run_config={"streaming_mode": "sse"},
    ):
        event_idx += 1
        text = _extract_text(event)
        if text is not None:
            texts.append(text)

        print(
            f"[event {event_idx:02d}] "
            f"type={type(event).__name__} "
            f"is_dict={isinstance(event, dict)} "
            f"partial={_partial_value(event)!r} "
            f"text={_preview(text)!r}"
        )

        if isinstance(event, dict) and event_idx == 1:
            # One-time dump of top-level keys for shape discovery.
            print(f"         dict_keys={sorted(event.keys())}")

    print(f"\nTotal events: {event_idx}")
    if texts:
        print(f"Text-bearing events: {len(texts)}")
        joined = "".join(texts)
        print(f"Join of all text fields ({len(joined)} chars): {_preview(joined, 200)!r}")
        if len(texts) >= 2 and texts[-1] == joined:
            print("→ last text equals join(all) → final event is likely CUMULATIVE.")
        elif len(texts) >= 2 and texts[-1] == texts[-2]:
            print("→ last two texts identical → possible duplicate final.")
        elif len(texts) >= 2 and joined.endswith(texts[-1]) and texts[-1] not in texts[:-1]:
            print("→ last text is a suffix of join → inspect partial flags per event.")
        else:
            print("→ compare partial=True lengths vs final partial=False length above.")

    return 0


def main() -> None:
    raise SystemExit(asyncio.run(_run()))


if __name__ == "__main__":
    main()
