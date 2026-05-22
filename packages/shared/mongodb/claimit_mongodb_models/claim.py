"""Claim collection — mirror of Claim.ts."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from .base import BaseDocument
from .enums import (
    ClaimOutcome,
    ClaimType,
    DenialReason,
    DraftGeneratedBy,
    Platform,
    SendMode,
    SubmittedVia,
)


class DraftVersion(BaseModel):
    version: int
    content: str
    generated_by: DraftGeneratedBy
    at: datetime


class SelfEvalScore(BaseModel):
    clarity: int = Field(ge=0, le=10)
    tone: int = Field(ge=0, le=10)
    accuracy: int = Field(ge=0, le=10)
    completeness: int = Field(ge=0, le=10)


class Claim(BaseDocument):
    # Invariant: draft_content always equals draft_versions[-1].content.
    # Kept as a top-level field for query convenience. Any update must keep both in sync.
    purchase_id: UUID
    user_id: UUID
    platform: Platform
    claim_amount: float = Field(gt=0)
    currency: Literal["USD"]
    claim_type: ClaimType
    draft_content: str
    draft_versions: list[DraftVersion] = Field(min_length=1)
    redraft_count: int = Field(ge=0)
    policy_clause_cited: str
    evidence_screenshot_url: str | None
    send_override: SendMode | None
    auto_send_at: datetime | None = None
    gmail_message_id: str | None = None
    submitted_at: datetime | None
    submitted_via: SubmittedVia | None
    outcome: ClaimOutcome
    outcome_note: str | None
    denial_reason_extracted: DenialReason | None
    resolved_at: datetime | None
    trace_id: str | None
    self_eval_score: SelfEvalScore | None = None
    self_eval_attempts: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _validate_draft_invariant(self) -> "Claim":
        if self.draft_content != self.draft_versions[-1].content:
            raise ValueError("draft_content must equal draft_versions[-1].content")
        return self
