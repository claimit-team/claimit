"""End-to-end tests for handle_price_dropped().

Each test calls handle_price_dropped() and exercises the full pipeline:
Pub/Sub decode -> plan_claim() -> _dispatch_generator() -> validate() ->
evaluate_and_maybe_regenerate -> upsert_claim -> send-mode branching ->
publish claim.drafted.

What runs for real: plan_claim(), validate(), _dispatch_generator() routing,
ClaimPlan construction.
What is stubbed: MongoDBClient (all I/O), Gemini ADK Runner (draft generation),
evaluate_and_maybe_regenerate (self-eval Gemini call), publish_event, search.
"""

from __future__ import annotations

import base64
import json
import sys
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from claimit_mongodb_models import ClaimType, SelfEvalScore, SendMode
from src.main import handle_price_dropped
from src.self_evaluate import SelfEvalResult

_USER_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
_CLAIM_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
_PURCHASE_ID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
_NOW = datetime(2026, 5, 23, 12, 0, 0, tzinfo=UTC)

# ---------------------------------------------------------------------------
# Fake Gemini / ADK output stubs
#
# Each JSON string uses only the placeholder tokens that the specific
# generator's fill function knows about.  After filling, no {{...}} tokens
# may remain or DraftGenerationError is raised inside the real generator.
# The order_id token must appear in the content so validate() passes its
# order-id-in-draft-content check.
# ---------------------------------------------------------------------------

_FAKE_EMAIL_JSON = json.dumps(
    {
        "subject": "Price Adjustment Request for Order {{ORDER_ID}}",
        "email_body": (
            "Hello {{MERCHANT_NAME}} Customer Care,\n\n"
            "I am writing to request a price match refund on Order {{ORDER_ID}} "
            "for {{PRODUCT_NAME}}, purchased on {{PURCHASE_DATE}} at {{ORIGINAL_PRICE}}.\n\n"
            "The current price is {{CURRENT_PRICE}}, a difference of {{REFUND_AMOUNT}} "
            "within the price-match window ending {{WINDOW_END_DATE}}.\n\n"
            "Per your policy: {{POLICY_CITATION}}\n\n"
            "Thank you,\n{{USER_NAME}}"
        ),
    }
)

_FAKE_CHAT_JSON = json.dumps(
    {
        "title": "Price Match Chat Script for Order {{ORDER_ID}}",
        "main_steps": [
            "Hello, I am {{USER_NAME}} contacting you about Order {{ORDER_ID}}.",
            "I purchased on {{CHECK_IN_DATE}}, with window ending {{CHECKOUT_DATE}}.",
            "I paid {{ORIGINAL_PRICE}} but the current price is {{CURRENT_PRICE}}, "
            "requesting {{REFUND_AMOUNT}}.",
            "Your policy states: {{POLICY_CITATION}}",
            "Please confirm the refund and reference Order {{ORDER_ID}}.",
        ],
        "escalation_steps": [
            "May I speak with a supervisor about Order {{ORDER_ID}} "
            "and the {{REFUND_AMOUNT}} refund?",
            "Please provide a case number for my records.",
        ],
    }
)

_FAKE_EMAIL_UNFILLED_JSON = json.dumps(
    {
        "subject": "Price Adjustment Request for Order {{ORDER_ID}}",
        "email_body": (
            "Hello {{MERCHANT_NAME}} Customer Care,\n\n"
            "I am writing to request a price match on Order {{ORDER_ID}} "
            "for {{PRODUCT_NAME}} at {{ORIGINAL_PRICE}}.\n\n"
            "The current price is {{CURRENT_PRICE}}, a difference of {{REFUND_AMOUNT}}.\n\n"
            "Per your policy: {{POLICY_CITATION}}\n\n"
            "Reference: {{UNFILLED}}\n\n"
            "Thank you,\n{{USER_NAME}}"
        ),
    }
)

_FAKE_IN_STORE_JSON = json.dumps(
    {
        "opening_statement": (
            "Hello, I am {{USER_NAME}} and I need a price match on Order {{ORDER_ID}}."
        ),
        "what_to_bring": [
            "Proof of purchase for Order {{ORDER_ID}}",
            "Screenshot showing current price {{CURRENT_PRICE}} vs original {{ORIGINAL_PRICE}}",
        ],
        "talking_points": [
            "I purchased {{PRODUCT_NAME}} at {{ORIGINAL_PRICE}} referencing Order {{ORDER_ID}}.",
            "The current price is {{CURRENT_PRICE}}, a difference of {{REFUND_AMOUNT}}.",
            "Per the published policy: {{POLICY_CITATION}}",
        ],
        "policy_citation": "Hilton Best Rate Guarantee covers pre-stay rate differences.",
        "fallback_note": (
            "If declined, request a manager and reference {{CLAIM_URL}} and Order {{ORDER_ID}}."
        ),
    }
)


# ---------------------------------------------------------------------------
# Fake ADK Runner (mirrors pattern from test_redraft_handler_e2e.py)
# ---------------------------------------------------------------------------


class _FakeFinalEvent:
    def __init__(self, text: str) -> None:
        class _Part:
            def __init__(self, inner: str) -> None:
                self.text = inner

        class _Content:
            def __init__(self, inner: str) -> None:
                self.parts = [_Part(inner)]

        self.content = _Content(text)

    def is_final_response(self) -> bool:
        return True


def _make_fake_runner(fake_json: str) -> type:
    """Return a Runner replacement class that yields fake_json as the final event."""

    class _FakeRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            yield _FakeFinalEvent(fake_json)

    return _FakeRunner


def _make_error_runner() -> type:
    """Return a Runner replacement class that raises RuntimeError on first iteration."""

    class _ErrorRunner:
        def __init__(self, **_kwargs: object) -> None:
            pass

        async def run_async(self, **_kwargs: object):
            raise RuntimeError("Gemini API unavailable")
            yield  # marks this as an async generator

    return _ErrorRunner


# ---------------------------------------------------------------------------
# Passthrough self-eval: returns the real draft untouched with a passing result
# ---------------------------------------------------------------------------


async def _passthrough_eval(
    draft: object,
    claim: object,
    purchase: object,
    policy: object,
    *,
    regenerate_fn: object = None,
) -> tuple:
    result = SelfEvalResult(
        passed=True,
        total_score=32,
        scores=SelfEvalScore(clarity=8, tone=8, accuracy=8, completeness=8),
        failed_dimensions=[],
        dimension_feedback={},
        improvement_suggestions={},
        draft_version="1",
        model_used="gemini-2.5-flash",
    )
    return draft, result, 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _pubsub_body(event_dict: dict) -> dict:
    encoded = base64.b64encode(json.dumps(event_dict).encode()).decode()
    return {"message": {"data": encoded, "messageId": "msg-e2e-001"}, "subscription": "sub-e2e"}


def _make_event_data(
    platform_id: str = "best_buy",
    price_drop_amount: float = 300.00,
    original_price: float = 1299.99,
    current_price: float = 999.99,
    **overrides: object,
) -> dict:
    return {
        # Canonical Pub/Sub envelope (extra fields ignored by local PriceDroppedEvent)
        "schema_version": 1,
        "event_id": "evt-e2e-001",
        "emitted_at": "2026-05-23T12:00:00Z",
        "event_type": "price.dropped",
        # Local PriceDroppedEvent fields consumed by plan_claim / handle_price_dropped
        "user_id": str(_USER_ID),
        "purchase_id": str(_PURCHASE_ID),
        "platform_id": platform_id,
        "claim_id": str(_CLAIM_ID),
        "original_price": original_price,
        "current_price": current_price,
        "price_drop_amount": price_drop_amount,
        "price_drop_pct": round((price_drop_amount / original_price) * 100, 2),
        "purchase_date": "2026-05-01T00:00:00Z",
        "detected_at": "2026-05-23T12:00:00Z",
        "currency": "USD",
        **overrides,
    }


def _make_mock_db(
    claim_type: ClaimType,
    platform: str = "best_buy",
    send_mode: SendMode = SendMode.APPROVAL,
    price_paid: float = 1299.99,
    product_name: str = "Samsung TV 65-inch",
    order_id: str = "ORD-BB-E2E-001",
) -> AsyncMock:
    policy = MagicMock()
    policy.claim_type = claim_type
    policy.id = uuid4()
    policy.category = "retail"
    policy.policy_text_relevant_clause = "Price match within 15 days of purchase."
    policy.claim_email = None
    policy.claim_url = None
    policy.claim_phone = None
    policy.policy_url = "https://claimit-test.example.com/policy"
    policy.key_exclusions = []

    purchase = MagicMock()
    purchase.id = _PURCHASE_ID
    purchase.platform = platform
    purchase.price_paid = price_paid
    purchase.purchase_date = _NOW - timedelta(days=10)
    purchase.window_expires = _NOW + timedelta(days=5)
    purchase.order_id = order_id
    purchase.product_name = product_name

    user = MagicMock()
    user.name = "Test User"
    user.default_location = None  # prevents find_nearest_store call in type_c_in_store
    user.send_preference = MagicMock()
    user.send_preference.default_mode = send_mode

    db = AsyncMock()
    db.get_policy.return_value = policy
    db.get_purchase.return_value = purchase
    db.get_user.return_value = user
    db.upsert_claim.return_value = None
    db.partial_update.return_value = True

    return db


def _make_mock_request(body: dict) -> AsyncMock:
    req = AsyncMock()
    req.json.return_value = body
    return req


# ---------------------------------------------------------------------------
# Test 1 — Best Buy EMAIL, approval mode — full pipeline
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bestbuy_email_full_pipeline() -> None:
    """handle_price_dropped() e2e: best_buy + ClaimType.EMAIL + approval mode.

    plan_claim() routes to EMAIL, type_a_email generator fills all placeholders,
    validate() passes, claim is persisted, claim.drafted is published once.
    """
    mock_db = _make_mock_db(ClaimType.EMAIL)
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(
        _pubsub_body(_make_event_data(platform_id="best_buy", price_drop_amount=300.00))
    )

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.draft._shared.Runner", _make_fake_runner(_FAKE_EMAIL_JSON)),
        patch(
            "src.main.evaluate_and_maybe_regenerate",
            new=AsyncMock(side_effect=_passthrough_eval),
        ),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch("src.main.write_notification_event", new=AsyncMock(return_value="notif-id")),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "ok", f"Expected ok, got: {result}"

    # Claim persisted: correct type, platform, non-empty draft that passes validate()
    mock_db.upsert_claim.assert_awaited_once()
    persisted = mock_db.upsert_claim.await_args.args[0]
    assert str(persisted.claim_type) == "email"
    assert str(persisted.platform) == "best_buy"
    assert persisted.draft_content
    assert persisted.draft_content != "Draft pending generation."
    assert "ORD-BB-E2E-001" in persisted.draft_content  # validate() order-id check passed

    # claim.drafted published once with correct payload
    mock_publish.assert_awaited_once()
    published_topic, published_event = mock_publish.await_args.args
    assert published_topic == "claim.drafted"
    assert published_event.purchase_id == str(_PURCHASE_ID)
    assert published_event.user_id == str(_USER_ID)
    assert published_event.claim_type == "email"
    assert published_event.send_mode == "approval"
    assert published_event.refund_amount == 300.00


# ---------------------------------------------------------------------------
# Test 2 — Southwest CHAT_SCRIPT, approval mode
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_southwest_chat_full_pipeline() -> None:
    """handle_price_dropped() e2e: southwest + ClaimType.CHAT_SCRIPT + type_b_chat generator."""
    mock_db = _make_mock_db(
        ClaimType.CHAT_SCRIPT,
        platform="southwest",
        order_id="CONF-SW-E2E-001",
        product_name="Southwest flight SFO-LAX",
        price_paid=350.00,
    )
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(
        _pubsub_body(
            _make_event_data(
                platform_id="southwest",
                original_price=350.00,
                current_price=250.00,
                price_drop_amount=100.00,
            )
        )
    )

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.draft._shared.Runner", _make_fake_runner(_FAKE_CHAT_JSON)),
        patch(
            "src.main.evaluate_and_maybe_regenerate",
            new=AsyncMock(side_effect=_passthrough_eval),
        ),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch("src.main.write_notification_event", new=AsyncMock(return_value="notif-id")),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "ok", f"Expected ok, got: {result}"

    persisted = mock_db.upsert_claim.await_args.args[0]
    # plan_claim routed to CHAT_SCRIPT via type_b_chat
    assert str(persisted.claim_type) == "chat_script"
    assert str(persisted.platform) == "southwest"
    assert "CONF-SW-E2E-001" in persisted.draft_content

    mock_publish.assert_awaited_once()
    _, published_event = mock_publish.await_args.args
    assert published_event.claim_type == "chat_script"
    assert published_event.send_mode == "approval"
    assert published_event.refund_amount == 100.00


# ---------------------------------------------------------------------------
# Test 3 — Hilton IN_STORE — full pipeline
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hilton_in_store_full_pipeline() -> None:
    """handle_price_dropped() e2e: hilton + ClaimType.IN_STORE + type_c_in_store generator.

    user.default_location=None prevents find_nearest_store from being called;
    store fields fall back to the policy URL.
    """
    mock_db = _make_mock_db(
        ClaimType.IN_STORE,
        platform="hilton",
        order_id="CONFIRM-HLT-E2E-001",
        product_name="Hilton Garden Inn Room",
        price_paid=200.00,
    )
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(
        _pubsub_body(
            _make_event_data(
                platform_id="hilton",
                original_price=200.00,
                current_price=150.00,
                price_drop_amount=50.00,
            )
        )
    )

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.draft._shared.Runner", _make_fake_runner(_FAKE_IN_STORE_JSON)),
        patch(
            "src.main.evaluate_and_maybe_regenerate",
            new=AsyncMock(side_effect=_passthrough_eval),
        ),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch("src.main.write_notification_event", new=AsyncMock(return_value="notif-id")),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "ok", f"Expected ok, got: {result}"

    persisted = mock_db.upsert_claim.await_args.args[0]
    assert str(persisted.claim_type) == "in_store"
    assert str(persisted.platform) == "hilton"
    assert "CONFIRM-HLT-E2E-001" in persisted.draft_content

    mock_publish.assert_awaited_once()
    _, published_event = mock_publish.await_args.args
    assert published_event.claim_type == "in_store"
    assert published_event.purchase_id == str(_PURCHASE_ID)
    assert published_event.user_id == str(_USER_ID)


# ---------------------------------------------------------------------------
# Test 4 — AUTO send mode: claim queued, event published with send_mode='auto'
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_send_mode_queues_claim() -> None:
    """handle_price_dropped() e2e: SendMode.AUTO runs the real handle_auto_mode.

    handle_auto_mode writes outcome='queued_for_send' + auto_send_at to
    partial_update and publishes claim.drafted with send_mode='auto'.
    """
    mock_db = _make_mock_db(ClaimType.EMAIL, send_mode=SendMode.AUTO)
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(
        _pubsub_body(_make_event_data(platform_id="best_buy", price_drop_amount=300.00))
    )

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.draft._shared.Runner", _make_fake_runner(_FAKE_EMAIL_JSON)),
        patch(
            "src.main.evaluate_and_maybe_regenerate",
            new=AsyncMock(side_effect=_passthrough_eval),
        ),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch(
            "src.main.write_notification_event", new=AsyncMock(return_value="notif-id")
        ) as mock_write,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "ok", f"Expected ok, got: {result}"

    # Claim was drafted and persisted before the send-mode branch
    mock_db.upsert_claim.assert_awaited_once()
    persisted = mock_db.upsert_claim.await_args.args[0]
    assert str(persisted.claim_type) == "email"
    assert persisted.draft_content != "Draft pending generation."

    # partial_update called with outcome='queued_for_send' and a future auto_send_at
    mock_db.partial_update.assert_awaited_once()
    _, _, update_dict = mock_db.partial_update.await_args.args
    assert update_dict["outcome"] == "queued_for_send"
    assert isinstance(update_dict["auto_send_at"], datetime)
    assert update_dict["auto_send_at"] > datetime.now(UTC)

    # claim.drafted published once with send_mode='auto' and auto_send_at set
    mock_publish.assert_awaited_once()
    published_topic, published_event = mock_publish.await_args.args
    assert published_topic == "claim.drafted"
    assert published_event.send_mode == "auto"
    assert published_event.auto_send_at is not None

    # write_notification_event called for both CLAIM_DRAFTED and CLAIM_QUEUED_AUTO
    assert mock_write.await_count >= 2
    notif_event_types = [str(c.kwargs.get("event_type", "")) for c in mock_write.await_args_list]
    assert any("claim_queued_auto" in et for et in notif_event_types)


# ---------------------------------------------------------------------------
# Test 5 — Unknown platform: error response, publish NOT called
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_platform_returns_error() -> None:
    """handle_price_dropped() e2e: no policy for platform -> UnknownPlatformError caught -> error.

    plan_claim() raises UnknownPlatformError when get_policy returns None.
    The outer except block returns {"status": "error"} without calling
    publish_event or upsert_claim.
    """
    mock_db = AsyncMock()
    mock_db.get_policy.return_value = None  # triggers UnknownPlatformError in plan_claim

    request = _make_mock_request(_pubsub_body(_make_event_data(platform_id="nonexistent_platform")))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "error"
    mock_publish.assert_not_awaited()
    mock_db.upsert_claim.assert_not_awaited()


# ---------------------------------------------------------------------------
# Test 6 — Purchase not found: early exit, publish NOT called
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_purchase_not_found_skips() -> None:
    """handle_price_dropped() e2e: get_purchase returns None -> early exit before drafting.

    plan_claim() succeeds (policy exists), but the purchase lookup returns None,
    so the handler returns {"status": "error", "reason": "purchase_not_found"}
    before reaching any draft generator or publish_event call.
    """
    mock_db = _make_mock_db(ClaimType.EMAIL)
    mock_db.get_purchase.return_value = None  # purchase missing from DB

    request = _make_mock_request(_pubsub_body(_make_event_data(platform_id="best_buy")))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "error"
    assert result.get("reason") == "purchase_not_found"
    mock_publish.assert_not_awaited()
    mock_db.upsert_claim.assert_not_awaited()


# ---------------------------------------------------------------------------
# Test 7 — Unreplaced placeholder in draft: error before persisting
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_fails_returns_error() -> None:
    """handle_price_dropped() e2e: fake draft contains {{UNFILLED}} token.

    _fill_email_placeholders leaves {{UNFILLED}} intact; type_a_email then
    detects '{{' in the filled output and raises DraftGenerationError. The
    outer except in handle_price_dropped returns status=error without calling
    upsert_claim or publish_event.
    """
    mock_db = _make_mock_db(ClaimType.EMAIL)
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(
        _pubsub_body(_make_event_data(platform_id="best_buy", price_drop_amount=300.00))
    )

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.draft._shared.Runner", _make_fake_runner(_FAKE_EMAIL_UNFILLED_JSON)),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch("src.main.write_notification_event", new=AsyncMock(return_value="notif-id")),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "error"
    mock_db.upsert_claim.assert_not_awaited()
    mock_publish.assert_not_awaited()


# ---------------------------------------------------------------------------
# Test 8 — Gemini runner raises: exception propagates before drafting completes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gemini_generation_fails_returns_error() -> None:
    """handle_price_dropped() e2e: Runner raises RuntimeError during draft generation.

    The exception propagates out of _dispatch_generator to the outer except in
    handle_price_dropped, which returns status=error without calling upsert_claim
    or publish_event.
    """
    mock_db = _make_mock_db(ClaimType.EMAIL)
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(
        _pubsub_body(_make_event_data(platform_id="best_buy", price_drop_amount=300.00))
    )

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.draft._shared.Runner", _make_error_runner()),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch("src.main.write_notification_event", new=AsyncMock(return_value="notif-id")),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "error"
    mock_publish.assert_not_awaited()
    mock_db.upsert_claim.assert_not_awaited()


# ---------------------------------------------------------------------------
# Test 9 — upsert_claim raises: DB write failure after successful draft
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_claim_fails_returns_error() -> None:
    """handle_price_dropped() e2e: upsert_claim raises Exception after successful draft.

    Draft generation and validate() both succeed. The exception from upsert_claim
    propagates to the outer except and returns status=error; publish_event (inside
    handle_approval_mode, called after upsert_claim) is never reached.
    """
    mock_db = _make_mock_db(ClaimType.EMAIL)
    mock_db.upsert_claim.side_effect = Exception("DB write failed")
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(
        _pubsub_body(_make_event_data(platform_id="best_buy", price_drop_amount=300.00))
    )

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.draft._shared.Runner", _make_fake_runner(_FAKE_EMAIL_JSON)),
        patch(
            "src.main.evaluate_and_maybe_regenerate",
            new=AsyncMock(side_effect=_passthrough_eval),
        ),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch("src.main.write_notification_event", new=AsyncMock(return_value="notif-id")),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_price_dropped(request)

    assert result["status"] == "error"
    mock_publish.assert_not_awaited()
