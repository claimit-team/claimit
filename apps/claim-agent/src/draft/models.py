from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ClaimDraft(BaseModel):
    claim_id: UUID
    draft_content: str
    subject: str
    to_address: str
    policy_clause_cited: str
    platform: str
    claim_type: str
    refund_amount: float
    currency: str = "USD"
    model_used: str
    draft_version: int = 1
    generated_at: datetime
