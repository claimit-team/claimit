"""ClaimIt assistant agent — Cloud Run entrypoint + internal Mode B SSE."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from claimit_observability import init_phoenix
from fastapi import Depends, FastAPI
from opentelemetry import context as otel_context
from opentelemetry import trace as otel_trace
from opentelemetry.trace import StatusCode, set_span_in_context
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import StreamingResponse

from .auth import verify_gateway_oidc
from .mode_b import HistoryMessage, handle_message, warm_up_mode_b_model


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_phoenix("claimit-assistant-agent")
    _app.state.warmup_task = asyncio.create_task(warm_up_mode_b_model())
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


logger = logging.getLogger(__name__)
_tracer = otel_trace.get_tracer("claimit.assistant-agent.mode-b")


def _format_sse_frame(event: str, data: str) -> str:
    lines = data.splitlines() or [""]
    data_block = "".join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_block}\n"


async def _stream_mode_b(body: ModeBStreamRequest) -> AsyncIterator[str]:
    # Create a wrapping span so all child spans (httpx→Gemini, pymongo)
    # share the same trace_id. Set it as the current span so the OTel
    # context propagates to auto-instrumented callees.
    span = _tracer.start_span(
        "mode_b.stream",
        attributes={"claim.id": body.claim_id, "user.id": body.user_id},
    )
    span_ctx = span.get_span_context()
    mode_b_trace_id = format(span_ctx.trace_id, "032x") if span_ctx.trace_id != 0 else None
    token: object | None = None
    try:
        token = otel_context.attach(set_span_in_context(span))
        history = [HistoryMessage(role=m.role, content=m.content) for m in body.messages]
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
            if event == "done" and mode_b_trace_id:
                try:
                    payload = json.loads(data) if data else {}
                    payload["trace_id"] = mode_b_trace_id
                    data = json.dumps(payload)
                except (json.JSONDecodeError, TypeError):
                    pass
            yield _format_sse_frame(str(event), data)
    except Exception:
        logger.exception("Mode B stream failed for claim %s", body.claim_id)
        span.set_status(StatusCode.ERROR)
        span.record_exception(sys.exc_info()[1])
        error_payload: dict = {"error": "Mode B stream failed unexpectedly."}
        if mode_b_trace_id:
            error_payload["trace_id"] = mode_b_trace_id
        yield _format_sse_frame("done", json.dumps(error_payload))
    finally:
        span.end()
        if token is not None:
            otel_context.detach(token)


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
