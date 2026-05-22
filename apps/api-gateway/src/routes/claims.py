"""Claims endpoints: list / detail / approve / cancel / edit.

See Attachment 2 §3.4 for the contract. All endpoints are Bearer-auth and
scoped to the authenticated user (services/claims_service.py enforces
ownership at the DB layer — 404 on mismatch, never 403).
"""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from claimit_mongodb_models import MongoDBClient, User
from claimit_mongodb_models.enums import ClaimOutcome, Platform, SendMode
from fastapi import APIRouter, Body, Depends, Path, Query, Response
from pydantic import BaseModel, Field

from ..deps import get_db, get_evidence_reader, get_pubsub_publisher
from ..middleware.auth import get_current_user
from ..middleware.errors import ApiError
from ..services import claims_service
from ..services.evidence_storage import EvidenceReader
from ..services.pubsub_publisher import PubSubPublisher

router = APIRouter(prefix="/claims", tags=["claims"])

StatusGroup = Literal["pending", "in_progress", "resolved"]


class ApproveClaimRequest(BaseModel):
    send_override: SendMode | None = None
    edited_draft_content: str | None = None


class CancelClaimRequest(BaseModel):
    reason: str | None = None


class EditClaimDraftRequest(BaseModel):
    draft_content: str = Field(min_length=1)


@router.get("")
async def list_claims(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    outcome: Annotated[ClaimOutcome | None, Query()] = None,
    status_group: Annotated[StatusGroup | None, Query()] = None,
    platform: Annotated[Platform | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query()] = None,
) -> dict[str, object]:
    """Paginated, enriched claims list, sorted by most recent activity first.

    Each row is a `ClaimListItem` — claim core fields plus `product_name`,
    `category`, `window_expires` joined from the linked Purchase via
    `$lookup`. Heavy claim fields (draft body, version history, etc.) are
    omitted from the list response and exposed only via the detail endpoint.

    Filter precedence: when both `outcome` and `status_group` are supplied,
    `outcome` wins and `status_group` is silently ignored. This keeps the UI
    (which drives `status_group` from filter chips) and admin tools (which
    filter by precise `outcome`) able to share the same endpoint without
    collision logic.

    Search:
    - `q` is matched case-insensitively against `platform` and the joined
      `product_name`. Input is `re.escape`d server-side, so regex
      metacharacters and ReDoS payloads degrade to literal substring matches.
    - Strings beyond `Q_MAX_LENGTH` (100 chars) are rejected with 400 so
      runaway-input regex compile cost stays bounded.

    Response: { claims: ClaimListItem[], next_cursor: str | null }
    """
    if q is not None:
        q = q.strip()
        if len(q) > claims_service.Q_MAX_LENGTH:
            raise ApiError(
                "invalid_search_query",
                f"Search query must be at most {claims_service.Q_MAX_LENGTH} characters",
                status_code=400,
            )
        if not q:
            q = None
    return await claims_service.list_claims(
        db=db,
        user_id=user.id,
        outcome=outcome,
        status_group=status_group,
        platform=platform,
        q=q,
        limit=limit,
        cursor=cursor,
    )


@router.get("/{claim_id}")
async def get_claim_detail(
    claim_id: Annotated[UUID, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Return a claim plus its linked purchase + policy.

    Response: { claim, purchase, policy, evidence_url, evidence_captured_at }
    """
    return await claims_service.get_claim_detail(db=db, user_id=user.id, claim_id=claim_id)


@router.get("/{claim_id}/evidence")
async def get_claim_evidence(
    claim_id: Annotated[UUID, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    evidence_reader: Annotated[EvidenceReader, Depends(get_evidence_reader)],
) -> Response:
    """Stream a user's price-drop evidence blob from GCS through api-gateway.

    Proxy (NOT a signed URL): the evidence bucket has
    public_access_prevention=enforced per terraform/storage.tf so we
    never mint signBlob credentials. api-gateway holds
    roles/storage.objectViewer on the bucket via the
    api_gateway_evidence_reader IAM binding (ticket 5.8); we proxy the
    bytes back to the authenticated browser with the original content-type.

    404 covers every failure mode (missing claim, non-owner, no
    evidence_screenshot_url, malformed gs:// URI, blob missing in GCS,
    bucket mismatch) — see services.claims_service.fetch_evidence_for_user.
    We never 403 / never leak existence across users.

    Screenshots are watermarked PNGs from the monitor-agent screenshot
    service (ticket 4.12); a plain `Response(content=bytes)` is
    sufficient — no streaming required.
    """
    data, content_type = await claims_service.fetch_evidence_for_user(
        db=db,
        evidence_reader=evidence_reader,
        user_id=user.id,
        claim_id=claim_id,
    )
    return Response(content=data, media_type=content_type)


@router.post("/{claim_id}/approve")
async def approve_claim(
    claim_id: Annotated[UUID, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    publisher: Annotated[PubSubPublisher, Depends(get_pubsub_publisher)],
    body: ApproveClaimRequest = Body(default_factory=ApproveClaimRequest),
) -> dict[str, object]:
    """Approve a draft claim — transitions outcome to PENDING and publishes
    claim.approved for the claim-agent to actually submit.
    """
    return await claims_service.approve_claim(
        db=db,
        publisher=publisher,
        user_id=user.id,
        claim_id=claim_id,
        send_override=body.send_override,
        edited_draft_content=body.edited_draft_content,
    )


@router.post("/{claim_id}/cancel")
async def cancel_claim(
    claim_id: Annotated[UUID, Path()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
    body: CancelClaimRequest = Body(default_factory=CancelClaimRequest),
) -> dict[str, object]:
    """Cancel a claim. Allowed only before submission OR within the 5-min
    auto-send window. 409 on later states.
    """
    return await claims_service.cancel_claim(
        db=db, user_id=user.id, claim_id=claim_id, reason=body.reason
    )


@router.put("/{claim_id}/edit")
async def edit_claim_draft(
    claim_id: Annotated[UUID, Path()],
    body: EditClaimDraftRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[MongoDBClient, Depends(get_db)],
) -> dict[str, object]:
    """Append a user-edited DraftVersion. Only allowed while the claim is in
    DRAFT_PENDING.
    """
    return await claims_service.edit_claim_draft(
        db=db, user_id=user.id, claim_id=claim_id, draft_content=body.draft_content
    )
