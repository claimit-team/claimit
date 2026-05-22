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
    """(user_id, platform, order_id) must be unique AND partial on order_id > "".

    Pre-5.14 prod-verify this was a plain unique index. The api-gateway
    upload writes a sentinel doc with `platform=AMAZON, order_id=""`
    (see `_UPLOAD_PURCHASE_DEFAULTS` in
    `apps/api-gateway/src/services/purchases.py`), and the
    extraction-failure rescue keeps `order_id=""`. Without the
    partial filter, a second upload from the same user collides on
    (user_id, "amazon", "") → DuplicateKeyError → 500 from the
    upload endpoint. This test pins the partial filter so a refactor
    can't reintroduce the regression.
    """
    purchases_specs = INDEX_DEFINITIONS["purchases"]
    triple_specs = [
        spec
        for spec in purchases_specs
        if spec["keys"] == [("user_id", 1), ("platform", 1), ("order_id", 1)]
    ]
    assert len(triple_specs) == 1, (
        f"Exactly one (user_id, platform, order_id) index expected; found {len(triple_specs)}"
    )
    spec = triple_specs[0]
    assert spec.get("unique") is True, "Triple index must remain unique"
    assert spec.get("partialFilterExpression") == {"order_id": {"$gt": ""}}, (
        "Triple index must be partial-filtered on order_id > '' so the "
        'upload sentinel and rescue paths (order_id="") don\'t collide'
    )


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
