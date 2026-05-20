"""Tests for MongoDBClient.array_push().

Locks the principle from PR #144 (round 2):
    Mutating a nested array validates ONLY the new element strictly;
    historical entries are NEVER re-validated on write.

Why this matters:
    `partial_update("claims", _id, {"draft_versions": [...whole array...]},
    model=Claim)` re-validates every entry against the strict
    `DraftVersion` schema. A long-lived claim that survived a
    `DraftGeneratedBy` enum migration would carry a legacy value on its
    v1 entry; the rewrite would 500. `array_push` performs an atomic
    `$push` for the new element + `$set` for sibling fields — Mongo
    appends to the in-place array without anyone reading the existing
    entries, so the legacy v1 stays untouched.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from claimit_mongodb_models import (
    Claim,
    DraftGeneratedBy,
    DraftVersion,
    MongoDBClient,
)
from pydantic import ValidationError


def _client_with_matched_count(matched_count: int) -> tuple[MongoDBClient, MagicMock]:
    """Stub the inner motor collection so update_one returns a result with
    the given matched_count. Bypasses __init__ to avoid the live URI."""
    client = MongoDBClient.__new__(MongoDBClient)
    update_result = MagicMock()
    update_result.matched_count = matched_count
    collection_mock = MagicMock()
    collection_mock.update_one = AsyncMock(return_value=update_result)
    db_mock = MagicMock()
    db_mock.__getitem__ = MagicMock(return_value=collection_mock)
    client._db = db_mock  # type: ignore[attr-defined]
    return client, collection_mock


def _new_version() -> DraftVersion:
    """A schema-valid DraftVersion to push."""
    return DraftVersion(
        version=2,
        content="My new content",
        generated_by=DraftGeneratedBy.USER_EDIT,
        at=datetime(2026, 5, 20, tzinfo=UTC),
    )


@pytest.mark.asyncio
async def test_array_push_emits_dollar_push_with_paired_dollar_set() -> None:
    """Happy path: the helper builds an atomic `{$push, $set}` update doc.
    The `$push` adds the new element under the named field; the `$set`
    pairs sibling-field mutations with the timestamp."""
    client, collection_mock = _client_with_matched_count(matched_count=1)

    claim_id = uuid4()
    new_version = _new_version()

    matched = await client.array_push(
        "claims",
        claim_id,
        field="draft_versions",
        element=new_version,
        element_model=DraftVersion,
        set_fields={"draft_content": "My new content"},
        parent_model=Claim,
    )

    assert matched is True
    collection_mock.update_one.assert_awaited_once()
    filter_arg, update_doc = collection_mock.update_one.await_args.args
    assert filter_arg == {"_id": claim_id}
    # $push targets the array field with the dumped new element.
    assert "$push" in update_doc
    push_payload = update_doc["$push"]["draft_versions"]
    assert push_payload["version"] == 2
    assert push_payload["content"] == "My new content"
    assert push_payload["generated_by"] == "user_edit"
    # $set carries the user-supplied set_fields + the auto-injected
    # updated_at timestamp.
    assert "$set" in update_doc
    set_payload = update_doc["$set"]
    assert set_payload["draft_content"] == "My new content"
    assert isinstance(set_payload["updated_at"], datetime)
    # The full-array overwrite IS NOT present — that's the bug being prevented.
    assert "draft_versions" not in set_payload


@pytest.mark.asyncio
async def test_array_push_returns_false_on_no_match() -> None:
    """matched_count=0 → False (document does not exist; caller decides
    if that's a 404 or a no-op)."""
    client, _ = _client_with_matched_count(matched_count=0)

    matched = await client.array_push(
        "claims",
        uuid4(),
        field="draft_versions",
        element=_new_version(),
        element_model=DraftVersion,
    )
    assert matched is False


@pytest.mark.asyncio
async def test_array_push_rejects_wrong_type_instance() -> None:
    """The fast-path that trusts pre-validated Pydantic instances must
    require the element to be an instance of `element_model` exactly.

    A previous version of the helper trusted any `BaseDocument` as
    already-valid (CodeRabbit Major on 65e583d), which would let
    `array_push(field='draft_versions', element=Claim(...),
    element_model=DraftVersion)` skip validation and $push a serialized
    Claim into `draft_versions`. That breaks the strict-on-new contract.

    We only need a stub `BaseDocument` subclass to reproduce — building a
    real `Claim` would require a long valid fixture. The contract under
    test is "wrong-type instance → routed through model_validate →
    raises". The DB call must not happen.
    """
    from claimit_mongodb_models.base import BaseDocument

    client, collection_mock = _client_with_matched_count(matched_count=1)

    class _OtherDoc(BaseDocument):
        # A different BaseDocument subclass; specifically NOT a DraftVersion.
        irrelevant: str = "x"

    other_instance = _OtherDoc(_id=uuid4())  # type: ignore[call-arg]

    with pytest.raises(ValidationError):
        await client.array_push(
            "claims",
            uuid4(),
            field="draft_versions",
            element=other_instance,
            element_model=DraftVersion,
        )

    # Routed through model_validate, which can't coerce an _OtherDoc into
    # a DraftVersion → raised before any update_one call.
    collection_mock.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_array_push_validates_dict_element_strictly() -> None:
    """A dict element with an invalid value (here `generated_by` not in
    `DraftGeneratedBy`) is rejected by `model_validate` BEFORE the DB
    call — that's the strict-on-NEW-data half of the contract."""
    client, collection_mock = _client_with_matched_count(matched_count=1)

    bogus_element = {
        "version": 2,
        "content": "x",
        "generated_by": "legacy_gen",  # not in DraftGeneratedBy
        "at": datetime(2026, 5, 20, tzinfo=UTC),
    }
    with pytest.raises(ValidationError):
        await client.array_push(
            "claims",
            uuid4(),
            field="draft_versions",
            element=bogus_element,
            element_model=DraftVersion,
        )

    # The bad element never made it past validation → no DB write.
    collection_mock.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_array_push_trusts_already_validated_pydantic_instance() -> None:
    """A `DraftVersion` instance is constructed-and-validated by Pydantic
    at instantiation. The helper must not redundantly re-validate it
    (defensive, but mostly to keep behaviour predictable for callers
    that built the element themselves)."""
    client, collection_mock = _client_with_matched_count(matched_count=1)

    # If this gets to the DB call, the trust contract is intact.
    await client.array_push(
        "claims",
        uuid4(),
        field="draft_versions",
        element=_new_version(),
        element_model=DraftVersion,
    )
    collection_mock.update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_array_push_validates_set_fields_against_parent_model() -> None:
    """`set_fields` are sibling-field $sets on the parent doc. When
    `parent_model` is supplied, each is validated against its parent
    annotation via TypeAdapter — same gate `partial_update` enforces.
    A bad `outcome` value (not in `ClaimOutcome`) must be rejected
    before the write."""
    client, collection_mock = _client_with_matched_count(matched_count=1)

    with pytest.raises(ValidationError):
        await client.array_push(
            "claims",
            uuid4(),
            field="draft_versions",
            element=_new_version(),
            element_model=DraftVersion,
            set_fields={"outcome": "totally_not_an_outcome"},
            parent_model=Claim,
        )

    collection_mock.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_array_push_rejects_unknown_set_field() -> None:
    """Unknown sibling-field names surface as `ValueError`, not silent
    no-ops — same shape as `partial_update`."""
    client, collection_mock = _client_with_matched_count(matched_count=1)

    with pytest.raises(ValueError, match="Unknown field"):
        await client.array_push(
            "claims",
            uuid4(),
            field="draft_versions",
            element=_new_version(),
            element_model=DraftVersion,
            set_fields={"definitely_not_a_field": True},
            parent_model=Claim,
        )

    collection_mock.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_array_push_rejects_id_in_set_fields() -> None:
    """Identity rewrites via `set_fields` are always a bug."""
    client, _ = _client_with_matched_count(matched_count=1)

    with pytest.raises(ValueError, match="_id"):
        await client.array_push(
            "claims",
            uuid4(),
            field="draft_versions",
            element=_new_version(),
            element_model=DraftVersion,
            set_fields={"_id": UUID(int=0)},
        )


@pytest.mark.asyncio
async def test_array_push_does_not_re_validate_historical_entries() -> None:
    """The whole point of this method, asserted at the operation level:
    no historical-entry data is sent to the DB on a $push, so a
    legacy-rogue v1 stored in Mongo is invisible to this write. We
    can't test that directly without a real DB, but we CAN assert the
    update doc the helper builds contains zero historical references —
    only `$push` + `$set`-sibling-fields, NEVER `$set.draft_versions`.
    """
    client, collection_mock = _client_with_matched_count(matched_count=1)

    await client.array_push(
        "claims",
        uuid4(),
        field="draft_versions",
        element=_new_version(),
        element_model=DraftVersion,
        set_fields={"draft_content": "My new content"},
        parent_model=Claim,
    )

    update_doc = collection_mock.update_one.await_args.args[1]
    # No full-array $set. If this assertion ever flips, the regression
    # is the same class as PR #144's round-2 finding.
    assert "draft_versions" not in update_doc.get("$set", {})
    # And the operation IS a $push under the array field.
    assert "draft_versions" in update_doc["$push"]
