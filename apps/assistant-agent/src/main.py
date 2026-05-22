"""ClaimIt assistant agent — Cloud Run entrypoint + internal Mode B SSE."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from claimit_observability import init_phoenix
from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import StreamingResponse

from .auth import verify_gateway_oidc
from .mode_b import HistoryMessage, handle_message


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-assistant-agent")
    yield


app = FastAPI(
    title="ClaimIt assistant agent",
    version="0.1.0",
    lifespan=lifespan,
)


class WireHistoryMessage(BaseModel):
    role: str
    content: str


class ModeBStreamRequest(BaseModel):
    user_id: str
    claim_id: str
    message: str
    messages: list[WireHistoryMessage] = Field(default_factory=list)


def _format_sse_frame(event: str, data: str) -> str:
    lines = data.splitlines() or [""]
    data_block = "".join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_block}\n"


async def _stream_mode_b(body: ModeBStreamRequest) -> AsyncIterator[str]:
    history = [HistoryMessage(role=m.role, content=m.content) for m in body.messages]
    try:
        async for frame in handle_message(
            body.user_id,
            body.claim_id,
            body.message,
            history=history or None,
        ):
            event = frame.get("event", "message")
            data = frame.get("data", "")
            if not isinstance(data, str):
                data = json.dumps(data)
            yield _format_sse_frame(str(event), data)
    except Exception:
        yield _format_sse_frame(
            "done",
            json.dumps({"error": "Mode B stream failed unexpectedly."}),
        )


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe used by Cloud Run + smoke tests."""
    return {"status": "ok", "agent": "assistant"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ClaimIt assistant agent is running"}


@app.post("/internal/mode-b/stream")
async def internal_mode_b_stream(
    body: ModeBStreamRequest,
    _request: Request,
    _auth: Annotated[None, Depends(verify_gateway_oidc)],
) -> StreamingResponse:
    """Internal SSE endpoint for api-gateway claim_focused chat."""
    return StreamingResponse(
        _stream_mode_b(body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
