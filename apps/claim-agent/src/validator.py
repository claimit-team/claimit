"""Output validator — anti-hallucination checks run after draft generation."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from claimit_mongodb_models import Claim, Purchase
from claimit_observability import get_tracer, span_with_attributes

from .draft.models import ClaimDraft
from .enum_compat import enum_to_str

_log = logging.getLogger(__name__)

# Maximum tolerated ratio between draft refund amount and claim amount.
# Drafts where either side exceeds the other by this factor are flagged
# as implausible Gemini hallucinations.
_REFUND_TOLERANCE_FACTOR = 10

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
            "claim.type": enum_to_str(claim.claim_type),
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
            issues.append(f"Order ID mismatch: '{purchase.order_id}' not found in draft content")

        # Check 3 — Numeric bounds (refund amount)
        if (
            draft.refund_amount != 0
            and claim.claim_amount != 0
            and (
                draft.refund_amount > claim.claim_amount * _REFUND_TOLERANCE_FACTOR
                or claim.claim_amount > draft.refund_amount * _REFUND_TOLERANCE_FACTOR
            )
        ):
            issues.append(
                f"Numeric bounds: refund {draft.refund_amount} is implausible vs claim {claim.claim_amount}"
            )

        # Check 4 — Prohibited language
        content_lower = draft.draft_content.lower()
        for phrase in PROHIBITED_PHRASES:
            if phrase in content_lower:
                issues.append(f"Prohibited language detected: '{phrase}'")

        valid = len(issues) == 0
        if not valid:
            issue_types = [issue.split(":")[0].strip() for issue in issues]
            span.set_attribute("validator.issue_count", len(issues))
            span.set_attribute("validator.issue_types", str(issue_types))
            _log.warning(
                "validator.failed claim_id=%s issue_count=%d issue_types=%s",
                claim.id,
                len(issues),
                issue_types,
            )

        return ValidationResult(valid=valid, issues=issues)
