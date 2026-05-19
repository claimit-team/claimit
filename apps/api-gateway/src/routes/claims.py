"""Claims endpoints: list / detail / approve / cancel / edit.

See Attachment 2 §3.4 for the contract. All endpoints are Bearer-auth and
scoped to the authenticated user (services/claims_service.py enforces
ownership at the DB layer — 404 on mismatch, never 403).
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from claimit_mongodb_models import MongoDBClient, User
from claimit_mongodb_models.enums import ClaimOutcome, Platform, SendMode
from fastapi import APIRouter, Body, Depends, Path, Query
from pydantic import BaseModel, Field

from ..deps import get_db, get_pubsub_publisher
from ..middleware.auth import get_current_user
from ..services import claims_service
from ..services.pubsub_publisher import PubSubPublisher

router = APIRouter(prefix="/claims", tags=["claims"])


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
    platform: Annotated[Platform | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query()] = None,
) -> dict[str, object]:
    """Paginated claims list, sorted by most recent activity first.

    Response: { claims: Claim[], next_cursor: str | null }
    """
    return await claims_service.list_claims(
        db=db,
        user_id=user.id,
        outcome=outcome,
        platform=platform,
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

    Response: { claim, purchase, policy, evidence_url }
    """
    return await claims_service.get_claim_detail(db=db, user_id=user.id, claim_id=claim_id)


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
