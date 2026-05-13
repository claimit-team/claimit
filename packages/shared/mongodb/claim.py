"""Claim collection — mirror of Claim.ts."""

from pydantic import BaseModel

from .base import BaseDocument
from .enums import (
    ClaimOutcome,
    ClaimType,
    DenialReason,
    DraftGeneratedBy,
    SendMode,
    SubmittedVia,
)


class DraftVersion(BaseModel):
    version: int
    content: str
    generated_by: DraftGeneratedBy
    at: str


class Claim(BaseDocument):
    purchase_id: str
    user_id: str
    platform: str
    claim_amount: float
    currency: str
    claim_type: ClaimType
    draft_content: str
    draft_versions: list[DraftVersion]
    redraft_count: int
    policy_clause_cited: str
    evidence_screenshot_url: str | None
    send_override: SendMode | None
    submitted_at: str | None
    submitted_via: SubmittedVia | None
    outcome: ClaimOutcome
    outcome_note: str | None
    denial_reason_extracted: DenialReason | None
    resolved_at: str | None
    trace_id: str | None
