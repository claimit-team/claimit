"""SSE event-stream endpoint: GET /api/v1/events/stream.

Long-lived response (sse-starlette EventSourceResponse) backed by the
polling generator in services/event_stream.py. Auth uses query-param
tokens because the browser EventSource API can't set custom headers;
see middleware/auth.get_current_user_from_query_token for details.

Frontend integration is intentionally out of scope for this ticket
(deferred to 5.10). The handler is reachable today via curl with a
Firebase ID token in the ?token= query param.
"""

from __future__ import annotations

from typing import Annotated

from claimit_mongodb_models import MongoDBClient, User
from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from ..deps import get_db
from ..middleware.auth import get_current_user_from_query_token
from ..services.event_stream import event_stream_generator

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/stream")
async def stream_events(
    user: Annotated[User, Depends(get_current_user_from_query_token)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> EventSourceResponse:
    """Long-lived SSE stream of notification events for the authenticated user.

    Auth: ?token=<firebase_id_token> (EventSource cannot set headers).
    Frames: event=notification with NotificationEvent JSON, or event=error
    on transient DB failure.
    """
    return EventSourceResponse(event_stream_generator(db, user.id))
