"""Read-tolerant variant of `Claim` — accept legacy/degraded docs without crashing.

Why this exists:
    Production data outlives enum definitions. A claim doc written by an
    earlier scratch-iteration of the schema (e.g. `claim_type='price_drop_refund'`
    when ClaimType is now {email, chat_script, in_store, self_service}) blows
    up `Claim.model_validate(...)` and 500s every read path that loads it
    (list/detail/cron/agents). See PR #141 follow-up audit for the eight
    distinct read sites this protects.

Policy:
    - STRICT on write (`Claim` stays the canonical model in `COLLECTION_MODELS`
      so all writes through `MongoDBClient.upsert` and `partial_update` keep
      enforcing the full schema, including enum membership and the
      `draft_content == draft_versions[-1].content` invariant).
    - LENIENT on read: enum-typed fields are widened to plain `str` and
      passed through verbatim (rogue values surface to the caller, which
      decides how to render or skip). Required scalars are widened to
      `T | None` so a missing/null field doesn't 500 deserialization.
      `Field(gt=0)`, `Field(ge=0)`, `Field(min_length=1)` constraints are
      dropped — accept whatever is stored.

This class is for READS ONLY. Never round-trip a `ClaimReadTolerant` back
into a write — it would silently relax write validation and defeat the
strict-write guarantee.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .base import BaseDocument


class DraftVersionReadTolerant(BaseModel):
    """Tolerant counterpart of `DraftVersion`.

    `generated_by` is widened to `str | None` (legacy data may carry an
    enum value the current `DraftGeneratedBy` literal set no longer
    recognises). Every field is optional so a partial sub-doc doesn't
    crash list-row deserialization.
    """

    model_config = ConfigDict(populate_by_name=True)

    version: int | None = None
    content: str | None = None
    generated_by: str | None = None
    at: datetime | None = None


class ClaimReadTolerant(BaseDocument):
    """Tolerant variant of `Claim` for the eight read paths enumerated in
    the §1 audit (api-gateway claims/purchases services, monitor-agent
    cron, claim-agent price-drop handler, etc.).

    Field annotations track `Claim` 1:1 except:

    - All enum-typed fields are `str | None` (verbatim pass-through; the
      consumer branches on the string, not the enum instance).
    - All scalars marked required on `Claim` are `T | None` here.
    - `Field(gt=0)` / `Field(ge=0)` / `Field(min_length=1)` are dropped.
    - The `@model_validator(after)` invariant on `Claim`
      (`draft_content == draft_versions[-1].content`) is NOT replicated —
      legacy docs that violate it should still load.
    - `draft_versions` accepts both an absent key (defaults via the
      `model_validator(after)` below) AND an EXPLICIT null in the stored
      doc. Pydantic v2's `default_factory` only fires when the key is
      missing, not when it's present-but-null, so a tolerant variant has
      to widen the type to `... | None` and coerce after.

    Subclasses `BaseDocument` so the generic `MongoDBClient.find_one /
    find_many / get` helpers (whose `T = TypeVar("T", bound=BaseDocument)`)
    accept it directly. The `id` / `updated_at` fields are re-declared
    here so that, unlike `BaseDocument`, `id` is optional — a doc with a
    malformed/missing `_id` is theoretical (Mongo always assigns one) but
    follows the lenient policy on principle.
    """

    model_config = ConfigDict(populate_by_name=True)

    # Override BaseDocument's required `id` to be optional. Field aliases
    # (`_id`) are preserved on both ends.
    id: UUID | None = Field(default=None, alias="_id")
    updated_at: datetime | None = None

    purchase_id: UUID | None = None
    user_id: UUID | None = None
    platform: str | None = None
    claim_amount: float | None = None
    reclaimed_amount: float | None = None
    currency: str | None = None
    claim_type: str | None = None
    draft_content: str | None = None
    # `... | None` so an explicit `null` stored in Mongo doesn't 500 the
    # read. Coerced to `[]` by `_coerce_null_collections` so the rest of
    # the codebase can iterate freely without a None-check.
    draft_versions: list[DraftVersionReadTolerant] | None = None
    redraft_count: int | None = None
    policy_clause_cited: str | None = None
    evidence_screenshot_url: str | None = None
    send_override: str | None = None
    auto_send_at: datetime | None = None
    subject: str | None = None
    recipient_email: str | None = None
    gmail_message_id: str | None = None
    submitted_at: datetime | None = None
    submitted_via: str | None = None
    outcome: str | None = None
    outcome_note: str | None = None
    denial_reason_extracted: str | None = None
    resolved_at: datetime | None = None
    trace_id: str | None = None

    @model_validator(mode="after")
    def _coerce_null_collections(self) -> ClaimReadTolerant:
        """Normalise `None` collections to their empty equivalents.

        `default_factory=list` only fires when a key is absent from the
        input dict; an explicit `{"draft_versions": None}` would still
        raise on a strictly-typed list. Widening the field to
        `list[...] | None` plus coercing to `[]` here gives us both:
        explicit-null tolerance on read AND a non-None invariant the
        rest of the consumers can rely on.
        """
        if self.draft_versions is None:
            self.draft_versions = []
        return self
