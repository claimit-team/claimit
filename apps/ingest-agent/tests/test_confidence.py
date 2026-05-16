"""Tests for aggregate extraction confidence."""

from __future__ import annotations

import pytest
from src.confidence import (
    CRITICAL_CONFIDENCE_FIELDS,
    DEFAULT_CONFIDENCE_THRESHOLD,
    compute_overall_min,
    get_confidence_threshold,
)


def _full_material_confidences(**overrides: float | None) -> dict[str, float | None]:
    base: dict[str, float | None] = {
        "platform": 0.99,
        "price": 0.98,
        "category": 0.97,
        "product_name": 0.96,
        "price_paid": 0.98,
        "purchase_date": 0.99,
        "order_id": 0.99,
        "overall_min": 0.5,
    }
    base.update(overrides)
    return base


def test_all_critical_above_threshold_returns_none_critical(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CLAIMIT_CONFIDENCE_THRESHOLD", raising=False)
    payload = _full_material_confidences()
    result = compute_overall_min(payload)

    assert result["critical_field_below_threshold"] is None
    assert result["overall_min"] == pytest.approx(min(0.99, 0.98, 0.97, 0.96, 0.98, 0.99, 0.99))


def test_one_critical_below_reports_that_field(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAIMIT_CONFIDENCE_THRESHOLD", raising=False)
    payload = _full_material_confidences(platform=0.94)
    result = compute_overall_min(payload)

    assert result["critical_field_below_threshold"] == "platform"
    assert result["overall_min"] == pytest.approx(0.94)


def test_multiple_critical_below_returns_lowest_score(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAIMIT_CONFIDENCE_THRESHOLD", raising=False)
    payload = _full_material_confidences(
        platform=0.92,
        price_paid=0.90,
        order_id=0.93,
        purchase_date=0.99,
    )
    result = compute_overall_min(payload)

    assert result["critical_field_below_threshold"] == "price_paid"
    assert result["overall_min"] == pytest.approx(min(0.92, 0.98, 0.97, 0.96, 0.90, 0.99, 0.93))


def test_none_critical_fields_are_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAIMIT_CONFIDENCE_THRESHOLD", raising=False)
    payload = _full_material_confidences()
    payload["order_id"] = None
    payload["purchase_date"] = None
    result = compute_overall_min(payload)

    assert result["critical_field_below_threshold"] is None


def test_threshold_env_var_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_CONFIDENCE_THRESHOLD", "0.80")
    assert get_confidence_threshold() == pytest.approx(0.8)

    payload = _full_material_confidences(platform=0.90)
    result = compute_overall_min(payload)

    assert result["critical_field_below_threshold"] is None


@pytest.mark.parametrize("bad_value", ["", "   ", "not-a-number", "0.95x", "nan-ish"])
def test_threshold_env_var_malformed_falls_back_to_default(
    monkeypatch: pytest.MonkeyPatch, bad_value: str
) -> None:
    monkeypatch.setenv("CLAIMIT_CONFIDENCE_THRESHOLD", bad_value)
    assert get_confidence_threshold() == pytest.approx(DEFAULT_CONFIDENCE_THRESHOLD)


@pytest.mark.parametrize("bad_value", ["-0.1", "1.01", "2", "-1", "100"])
def test_threshold_env_var_out_of_range_falls_back_to_default(
    monkeypatch: pytest.MonkeyPatch, bad_value: str
) -> None:
    monkeypatch.setenv("CLAIMIT_CONFIDENCE_THRESHOLD", bad_value)
    assert get_confidence_threshold() == pytest.approx(DEFAULT_CONFIDENCE_THRESHOLD)


def test_threshold_env_var_whitespace_trimmed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMIT_CONFIDENCE_THRESHOLD", "  0.42  ")
    assert get_confidence_threshold() == pytest.approx(0.42)


def test_exactly_at_threshold_does_not_trigger(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAIMIT_CONFIDENCE_THRESHOLD", raising=False)
    threshold = DEFAULT_CONFIDENCE_THRESHOLD
    payload = _full_material_confidences(
        platform=threshold,
        price_paid=threshold,
        order_id=threshold,
        purchase_date=threshold,
    )
    result = compute_overall_min(payload)

    assert result["critical_field_below_threshold"] is None


def test_empty_material_fields_yield_zero_overall_min(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAIMIT_CONFIDENCE_THRESHOLD", raising=False)
    result = compute_overall_min({})

    assert result["overall_min"] == 0.0
    assert result["critical_field_below_threshold"] is None


def test_critical_fields_follow_ticket_order_for_ties(monkeypatch: pytest.MonkeyPatch) -> None:
    """When two critical fields share the same lowest below-threshold score, pick earlier in CRITICAL_CONFIDENCE_FIELDS."""
    monkeypatch.delenv("CLAIMIT_CONFIDENCE_THRESHOLD", raising=False)
    low = 0.90
    payload = _full_material_confidences(
        platform=low,
        price_paid=low,
        order_id=0.99,
        purchase_date=0.99,
    )
    result = compute_overall_min(payload)

    assert CRITICAL_CONFIDENCE_FIELDS.index(
        result["critical_field_below_threshold"] or ""
    ) < CRITICAL_CONFIDENCE_FIELDS.index("price_paid")
