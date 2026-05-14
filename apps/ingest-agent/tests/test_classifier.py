"""Tests for the ingest order-confirmation classifier."""

from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError
from src import classifier
from src.classifier import (
    ClassificationResult,
    ClassifierError,
    EmailForClassification,
    classify,
)


def _sample_email(body_text: str = "Thanks for your order. Order #A123.") -> EmailForClassification:
    return EmailForClassification(
        sender="orders@example.com",
        subject="Your order is confirmed",
        snippet="Thanks for your order.",
        body_text=body_text,
    )


def test_classify_returns_order_result(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run_agent(email: EmailForClassification) -> str:
        assert email.subject == "Your order is confirmed"
        return json.dumps({"is_order": True, "confidence": 0.98})

    monkeypatch.setattr(classifier, "_run_classifier_agent", fake_run_agent)

    result = asyncio.run(classify(_sample_email()))

    assert result == ClassificationResult(is_order=True, confidence=0.98)


def test_classify_returns_non_order_result(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run_agent(_email: EmailForClassification) -> str:
        return json.dumps({"is_order": False, "confidence": 0.97})

    monkeypatch.setattr(classifier, "_run_classifier_agent", fake_run_agent)

    result = asyncio.run(
        classify(
            EmailForClassification(
                sender="security@example.com",
                subject="Reset your password",
                snippet="Use this link to reset your password.",
                body_text="This is a password reset message.",
            )
        )
    )

    assert result.is_order is False
    assert result.confidence == 0.97


def test_classify_raises_for_malformed_json(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run_agent(_email: EmailForClassification) -> str:
        return "yes, probably"

    monkeypatch.setattr(classifier, "_run_classifier_agent", fake_run_agent)

    with pytest.raises(ClassifierError, match="malformed JSON"):
        asyncio.run(classify(_sample_email()))


def test_classify_raises_for_missing_required_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run_agent(_email: EmailForClassification) -> str:
        return json.dumps({"confidence": 0.9})

    monkeypatch.setattr(classifier, "_run_classifier_agent", fake_run_agent)

    with pytest.raises(ValidationError):
        asyncio.run(classify(_sample_email()))


def test_classify_raises_for_confidence_out_of_range(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run_agent(_email: EmailForClassification) -> str:
        return json.dumps({"is_order": True, "confidence": 1.2})

    monkeypatch.setattr(classifier, "_run_classifier_agent", fake_run_agent)

    with pytest.raises(ValidationError):
        asyncio.run(classify(_sample_email()))


def test_format_email_truncates_body_deterministically() -> None:
    email = _sample_email(body_text="x" * (classifier.MAX_BODY_CHARS + 25))

    payload = json.loads(classifier._format_email(email))

    assert payload["body_text"] == "x" * classifier.MAX_BODY_CHARS
    assert list(payload) == ["body_text", "sender", "snippet", "subject"]


def test_run_classifier_agent_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    class SlowRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            await asyncio.sleep(1)
            yield None

    monkeypatch.setattr(classifier, "Runner", SlowRunner)
    monkeypatch.setattr(classifier, "CLASSIFIER_TIMEOUT_SECONDS", 0.001)

    with pytest.raises(ClassifierError, match="timed out"):
        asyncio.run(classifier._run_classifier_agent(_sample_email()))
