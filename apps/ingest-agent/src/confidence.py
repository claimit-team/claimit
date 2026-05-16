"""Aggregate extraction confidence for ingest MVP."""

from __future__ import annotations

import os
from typing import TypedDict

CRITICAL_CONFIDENCE_FIELDS = ("platform", "price_paid", "order_id", "purchase_date")

MATERIAL_CONFIDENCE_KEYS = (
    "platform",
    "price",
    "category",
    "product_name",
    "price_paid",
    "purchase_date",
    "order_id",
)

DEFAULT_CONFIDENCE_THRESHOLD = 0.95
_CONFIDENCE_THRESHOLD_ENV = "CLAIMIT_CONFIDENCE_THRESHOLD"


class OverallMinResult(TypedDict):
    overall_min: float
    critical_field_below_threshold: str | None


def get_confidence_threshold() -> float:
    """Read the threshold from CLAIMIT_CONFIDENCE_THRESHOLD with safe fallback.

    Returns DEFAULT_CONFIDENCE_THRESHOLD if the env var is unset, empty,
    non-numeric, or outside the inclusive 0.0-1.0 range. Silent fallback is
    intentional so a malformed deployment config can't take down ingestion.
    """
    raw = os.environ.get(_CONFIDENCE_THRESHOLD_ENV)
    if raw is None or raw.strip() == "":
        return DEFAULT_CONFIDENCE_THRESHOLD
    try:
        threshold = float(raw.strip())
    except (TypeError, ValueError):
        return DEFAULT_CONFIDENCE_THRESHOLD
    if not 0.0 <= threshold <= 1.0:
        return DEFAULT_CONFIDENCE_THRESHOLD
    return threshold


def compute_overall_min(field_confidences: dict[str, float | None]) -> OverallMinResult:
    """Minimum confidence over material fields plus lowest critical field below threshold.

    Critical fields (MVP): platform, price_paid, order_id, purchase_date.
    When any critical field is strictly below the configurable threshold, returns the name of
    the critical field with the lowest confidence among those below threshold.
    """
    threshold = get_confidence_threshold()

    material_values = [
        field_confidences[key]
        for key in MATERIAL_CONFIDENCE_KEYS
        if field_confidences.get(key) is not None
    ]
    overall_min = min(material_values) if material_values else 0.0

    critical_below: str | None = None
    lowest_below: float | None = None
    for field in CRITICAL_CONFIDENCE_FIELDS:
        val = field_confidences.get(field)
        if val is None:
            continue
        if val >= threshold:
            continue
        if lowest_below is None or val < lowest_below:
            lowest_below = val
            critical_below = field

    return OverallMinResult(
        overall_min=overall_min,
        critical_field_below_threshold=critical_below,
    )
