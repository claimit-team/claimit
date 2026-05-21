"""Output validator — anti-hallucination checks run after draft generation."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from claimit_mongodb_models import Claim, Purchase
from claimit_observability import get_tracer, span_with_attributes

from .draft.models import ClaimDraft

_log = logging.getLogger(__name__)

PROHIBITED_PHRASES = [
    "sue you",
    "take legal action",
    "file a lawsuit",
    "small claims court",
    "attorney",
    "lawyer",
    "stupid",
    "idiot",
    "incompetent",
    "social security",
    "credit card number",
    "password",
]

_PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")


@dataclass
class ValidationResult:
    valid: bool
    issues: list[str] = field(default_factory=list)


def validate(draft: ClaimDraft, claim: Claim, purchase: Purchase) -> ValidationResult:
    """Validate a generated draft before persisting or sending.

    Runs four checks in sequence. Collects ALL issues (does not short-circuit)
    so the caller gets a complete picture of what failed.
    Returns ValidationResult(valid=True, issues=[]) if all checks pass.
    """
    tracer = get_tracer(__name__)
    with span_with_attributes(
        tracer,
        "validator.validate",
        {
            "claim.id": str(claim.id),
            "claim.type": claim.claim_type.value,
            "draft.version": draft.draft_version,
        },
    ) as span:
        issues: list[str] = []

        # Check 1 — Unresolved placeholders
        matches = _PLACEHOLDER_RE.findall(draft.draft_content)
        if matches:
            issues.append(f"Unresolved placeholders: {', '.join(matches)}")

        # Check 2 — Order ID mismatch
        if purchase.order_id and purchase.order_id not in draft.draft_content:
            issues.append(f"Order ID '{purchase.order_id}' not found in draft content")

        # Check 3 — Numeric bounds (refund amount)
        if (
            draft.refund_amount != 0
            and claim.claim_amount != 0
            and (
                draft.refund_amount > claim.claim_amount * 10
                or claim.claim_amount > draft.refund_amount * 10
            )
        ):
            issues.append(
                f"Refund amount {draft.refund_amount} is implausible vs claim amount {claim.claim_amount}"
            )

        # Check 4 — Prohibited language
        content_lower = draft.draft_content.lower()
        for phrase in PROHIBITED_PHRASES:
            if phrase in content_lower:
                issues.append(f"Prohibited language detected: '{phrase}'")

        valid = len(issues) == 0
        if not valid:
            span.set_attribute("validator.issues", str(issues))
            span.set_attribute("validator.issue_count", len(issues))
            _log.warning(
                "validator.failed claim_id=%s issues=%s",
                claim.id,
                issues,
            )

        return ValidationResult(valid=valid, issues=issues)
