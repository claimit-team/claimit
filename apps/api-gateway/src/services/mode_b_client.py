"""HTTP client for assistant-agent Mode B internal SSE (ticket 5.9)."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import google.auth.transport.requests
import httpx
from claimit_mongodb_models.conversation import ConversationMessage
from google.oauth2 import id_token

logger = logging.getLogger(__name__)

_TOKEN_LIFETIME_SECONDS = 3600
_REFRESH_CUSHION_SECONDS = 300

_token_lock = threading.Lock()
_cached_token: str | None = None
_token_expiry: float = 0.0


def _assistant_agent_url() -> str:
    url = os.environ.get("ASSISTANT_AGENT_URL", "").strip().rstrip("/")
    if not url:
        raise ValueError("Assistant agent URL not configured")
    return url


def _get_id_token(audience: str) -> str:
    global _cached_token, _token_expiry
    now = time.monotonic()
    with _token_lock:
        if _cached_token and now < _token_expiry:
            return _cached_token
        request = google.auth.transport.requests.Request()
        _cached_token = id_token.fetch_id_token(request, audience)
        _token_expiry = now + _TOKEN_LIFETIME_SECONDS - _REFRESH_CUSHION_SECONDS
        return _cached_token


def _wire_history(messages: list[ConversationMessage]) -> list[dict[str, str]]:
    return [{"role": m.role.value, "content": m.content} for m in messages]


def _find_frame_end(buffer: str) -> int:
    a = buffer.find("\r\n\r\n")
    b = buffer.find("\n\n")
    if a == -1:
        return b
    if b == -1:
        return a
    return min(a, b)


def _frame_terminator_length(buffer: str, frame_end: int) -> int:
    return 4 if buffer.startswith("\r\n\r\n", frame_end) else 2


def _parse_sse_frame(raw: str) -> dict[str, str] | None:
    event_type = "message"
    data_lines: list[str] = []
    for line in raw.split("\n"):
        line = line.strip("\r")
        if not line or line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_type = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    if not data_lines and event_type == "message":
        return None
    return {"event": event_type, "data": "\n".join(data_lines)}


async def stream_mode_b_response(
    user_id: UUID,
    claim_id: UUID,
    user_message: str,
    history: list[ConversationMessage],
) -> AsyncGenerator[dict[str, Any], None]:
    """POST to assistant-agent /internal/mode-b/stream and yield SSE dicts."""
    base_url = _assistant_agent_url()
    token = _get_id_token(base_url)
    payload = {
        "user_id": str(user_id),
        "claim_id": str(claim_id),
        "message": user_message,
        "messages": _wire_history(history),
    }

    collected_text = ""
    collected_tool_calls: list[dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:  # noqa: SIM117
            async with client.stream(
                "POST",
                f"{base_url}/internal/mode-b/stream",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    logger.error(
                        "Mode B upstream returned %s: %s",
                        response.status_code,
                        body[:500],
                    )
                    yield {
                        "event": "done",
                        "data": json.dumps(
                            {
                                "error": (
                                    "I'm having trouble connecting to the claim assistant. "
                                    "Please try again in a moment."
                                )
                            }
                        ),
                    }
                    return

                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    while True:
                        frame_end = _find_frame_end(buffer)
                        if frame_end == -1:
                            break
                        frame_raw = buffer[:frame_end]
                        buffer = buffer[frame_end + _frame_terminator_length(buffer, frame_end) :]
                        parsed = _parse_sse_frame(frame_raw)
                        if parsed is None:
                            continue
                        event_name = parsed["event"]
                        data = parsed["data"]
                        if event_name == "text_chunk":
                            try:
                                text = json.loads(data).get("text", "")
                                if text:
                                    collected_text += text
                            except json.JSONDecodeError:
                                pass
                        elif event_name == "tool_call":
                            try:
                                tc = json.loads(data)
                                if tc.get("tool"):
                                    collected_tool_calls.append(
                                        {
                                            "tool": tc["tool"],
                                            "input": tc.get("input", {}),
                                        }
                                    )
                            except json.JSONDecodeError:
                                pass
                        yield {"event": event_name, "data": data}
                        if event_name == "done":
                            return

                if not collected_text.strip() and not collected_tool_calls:
                    fallback = (
                        "I wasn't able to generate a response. Could you rephrase your question?"
                    )
                    yield {"event": "text_chunk", "data": json.dumps({"text": fallback})}
                yield {"event": "done", "data": json.dumps({})}

    except ValueError:
        yield {
            "event": "done",
            "data": json.dumps({"error": "I'm temporarily unavailable. Please try again later."}),
        }
    except Exception:
        logger.exception("Mode B HTTP stream failed")
        yield {
            "event": "done",
            "data": json.dumps(
                {"error": "I'm having trouble connecting. Please try again in a moment."}
            ),
        }
