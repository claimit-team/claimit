"""Spec-level tests for INDEX_DEFINITIONS.

These tests assert the shape of the index definitions without
touching a live Mongo. The real drop-and-recreate behavior is
exercised by the migration script (`scripts/run_migrations.sh`)
against a real Atlas; the unit gate's job is just to lock in the
load-bearing index spec details so a future refactor can't quietly
weaken them.
"""

from __future__ import annotations

from claimit_mongodb_models import INDEX_DEFINITIONS


def test_purchases_user_platform_order_id_index_is_partial_unique() -> None:
    """(user_id, platform, order_id, receipt_line_key) must be unique AND
    partial on order_id > "".

    Pre-5.14 prod-verify this was a plain unique index, then a partial
    unique on the (user_id, platform, order_id) triple. The
    multi-item-receipt work widened it to a 4-key index: `receipt_line_key`
    lets several items off ONE receipt — which share a single real
    order_id — each become their own monitored purchase. The api-gateway
    upload writes a sentinel doc with `order_id=""` and the rescue keeps
    `order_id=""`; without the partial filter a second upload collides on
    (user_id, "amazon", "", null) → 500. Single-item / Gmail / manual rows
    write `receipt_line_key=null`, so two same-order rows still collide on
    the null key value — the pre-existing dedup is preserved. This test
    pins both the 4-key shape and the partial filter.
    """
    purchases_specs = INDEX_DEFINITIONS["purchases"]
    triple_specs = [
        spec
        for spec in purchases_specs
        if spec["keys"]
        == [("user_id", 1), ("platform", 1), ("order_id", 1), ("receipt_line_key", 1)]
    ]
    assert len(triple_specs) == 1, (
        "Exactly one (user_id, platform, order_id, receipt_line_key) index "
        f"expected; found {len(triple_specs)}"
    )
    spec = triple_specs[0]
    assert spec.get("unique") is True, "Index must remain unique"
    assert spec.get("partialFilterExpression") == {"order_id": {"$gt": ""}}, (
        "Index must be partial-filtered on order_id > '' so the upload "
        'sentinel and rescue paths (order_id="") don\'t collide'
    )

    # The pre-widening 3-key triple must NOT also be present — the migration
    # drops it explicitly; leaving its spec here would recreate it and keep
    # blocking multiple lines off one receipt.
    legacy = [
        spec
        for spec in purchases_specs
        if spec["keys"] == [("user_id", 1), ("platform", 1), ("order_id", 1)]
    ]
    assert legacy == [], "The legacy 3-key (user_id, platform, order_id) index must be removed"


def test_purchases_receipt_hash_partial_index_unchanged() -> None:
    """Receipt-hash partial index must keep its pre-existing shape.

    The C2 change touches only the triple index; this test catches a
    copy-paste regression that would, e.g., overwrite the
    `receipt_hash` filter or swap its type predicate.
    """
    purchases_specs = INDEX_DEFINITIONS["purchases"]
    rh_specs = [spec for spec in purchases_specs if spec["keys"] == [("receipt_hash", 1)]]
    assert len(rh_specs) == 1
    spec = rh_specs[0]
    assert spec.get("unique") is True
    assert spec.get("partialFilterExpression") == {"receipt_hash": {"$type": "string"}}
