"""Tests for the resolver orchestrator: scenario matrix, price bound, persist."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from src.resolver import service as svc
from src.resolver.base import Candidate, ProductUrlResolver, Scenario

_BB = "https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p"


class _StubResolver(ProductUrlResolver):
    host = "www.bestbuy.com"

    def __init__(self, candidates: list[Candidate]) -> None:
        self._candidates = candidates

    def is_product_url(self, url: str) -> bool:
        return url.startswith("https://www.bestbuy.com/site/")

    def resolve(self, product_name: str, price_paid: float) -> list[Candidate]:
        return self._candidates


def _match_candidate(listed_price: float | None = None) -> Candidate:
    return Candidate(
        url=_BB, product_id="6505727", title="Sony WH-1000XM5", listed_price=listed_price
    )


def _patch_resolver(candidates: list[Candidate]):
    return patch.object(svc, "get_resolver", return_value=_StubResolver(candidates))


@pytest.mark.asyncio
async def test_already_valid_short_circuits() -> None:
    with _patch_resolver([]):
        result = await svc.resolve_product_url("best_buy", "Sony", 100.0, _BB)
    assert result.scenario is Scenario.ALREADY_VALID
    assert result.url == _BB


@pytest.mark.asyncio
async def test_blank_resolves() -> None:
    with _patch_resolver([_match_candidate()]):
        result = await svc.resolve_product_url("best_buy", "Sony WH-1000XM5", 100.0, None)
    assert result.scenario is Scenario.RESOLVED
    assert result.url == _BB
    assert result.confidence > 0.5


@pytest.mark.asyncio
async def test_wrong_url_corrected() -> None:
    with _patch_resolver([_match_candidate()]):
        result = await svc.resolve_product_url(
            "best_buy", "Sony WH-1000XM5", 100.0, "https://www.amazon.com/dp/x"
        )
    assert result.scenario is Scenario.CORRECTED
    assert result.url == _BB


@pytest.mark.asyncio
async def test_blank_unresolved() -> None:
    with _patch_resolver([]):
        result = await svc.resolve_product_url("best_buy", "Sony", 100.0, None)
    assert result.scenario is Scenario.UNRESOLVED_BLANK
    assert result.url is None


@pytest.mark.asyncio
async def test_invalid_url_unresolved() -> None:
    with _patch_resolver([]):
        result = await svc.resolve_product_url(
            "best_buy", "Sony", 100.0, "https://www.amazon.com/dp/x"
        )
    assert result.scenario is Scenario.UNRESOLVED_HAD_URL


@pytest.mark.asyncio
async def test_price_bound_rejects_gross_mismatch() -> None:
    # Candidate priced 100x the paid price is almost certainly the wrong item.
    with _patch_resolver([_match_candidate(listed_price=10_000.0)]):
        result = await svc.resolve_product_url("best_buy", "Sony", 100.0, None)
    assert result.scenario is Scenario.UNRESOLVED_BLANK
    assert result.url is None


@pytest.mark.asyncio
async def test_price_bound_accepts_in_band() -> None:
    with _patch_resolver([_match_candidate(listed_price=120.0)]):
        result = await svc.resolve_product_url("best_buy", "Sony WH-1000XM5", 100.0, None)
    assert result.scenario is Scenario.RESOLVED


@pytest.mark.asyncio
async def test_unresolvable_platform_is_noop() -> None:
    result = await svc.resolve_product_url("amazon", "Echo Dot", 50.0, None)
    assert result.scenario is Scenario.UNRESOLVED_BLANK
    assert result.url is None


@pytest.mark.asyncio
async def test_resolve_and_persist_writes_url_and_notifies() -> None:
    db = SimpleNamespace(partial_update=AsyncMock(return_value=True))
    purchase = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        platform="best_buy",
        product_name="Sony WH-1000XM5",
        product_url=None,
        price_paid=100.0,
    )
    with (
        _patch_resolver([_match_candidate(listed_price=120.0)]),
        patch.object(svc, "write_notification_event", AsyncMock()) as mock_notify,
    ):
        result = await svc._resolve_and_persist(db, purchase)

    assert result.scenario is Scenario.RESOLVED
    assert purchase.product_url == _BB
    db.partial_update.assert_awaited_once()
    args, _ = db.partial_update.call_args
    assert args[3].__name__ == "Purchase"  # model passed positionally
    assert args[2]["product_url"] == _BB
    assert args[2]["last_monitor_error_code"] is None
    mock_notify.assert_awaited_once()
    _, kwargs = mock_notify.call_args
    assert kwargs["event_type"].value == "product_url_resolved"
    assert kwargs["data"]["low_confidence"] is False


@pytest.mark.asyncio
async def test_resolve_and_persist_unresolved_can_skip_notification() -> None:
    db = SimpleNamespace(partial_update=AsyncMock(return_value=True))
    purchase = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        platform="best_buy",
        product_name="Sony",
        product_url=None,
        price_paid=100.0,
    )
    with _patch_resolver([]), patch.object(svc, "write_notification_event", AsyncMock()) as notify:
        result = await svc._resolve_and_persist(db, purchase, notify_unresolved=False)

    assert result.url is None
    db.partial_update.assert_not_awaited()
    notify.assert_not_awaited()


@pytest.mark.asyncio
async def test_persist_failure_returns_url_none_scenario_preserved() -> None:
    """A DB write failure must NOT leak the resolved URL to callers.

    Cron counters and the pubsub handler treat ``result.url is not None`` as
    "successful resolve". If persist throws after the URL is decided, callers
    must see ``url=None`` so the cron's `resolved` counter isn't incremented
    and no NotificationEvent is written.
    """
    db = SimpleNamespace(partial_update=AsyncMock(side_effect=RuntimeError("mongo down")))
    purchase = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        platform="best_buy",
        product_name="Sony WH-1000XM5",
        product_url=None,
        price_paid=100.0,
    )
    with (
        _patch_resolver([_match_candidate(listed_price=120.0)]),
        patch.object(svc, "write_notification_event", AsyncMock()) as notify,
    ):
        result = await svc._resolve_and_persist(db, purchase)

    # url cleared so caller doesn't count this as a successful resolve…
    assert result.url is None
    # …but the original scenario is preserved for diagnostics / logging.
    assert result.scenario is Scenario.RESOLVED
    # purchase.product_url stays None because the in-memory mutation only
    # happens after the awaited partial_update returns.
    assert purchase.product_url is None
    # No notification because the persist failed before we got there.
    notify.assert_not_awaited()
