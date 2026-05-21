"""Read-tolerant variant of `PriceHistory` — accept legacy/degraded rows without crashing.

Why this exists, and the strict-on-write contract: see the docstring on
`claim_read_tolerant.ClaimReadTolerant`. Same policy applied to PriceHistory:
enum-typed fields become `str | None` (verbatim pass-through), required
scalars are widened to `T | None`, and numeric range constraints
(`Field(ge=0)`) are dropped.

Why now (ticket 5.6):
    The enriched purchase-detail endpoint reads a purchase's price history
    via `find_price_history`. A single legacy row with a `source` value the
    current `PriceSource` enum no longer recognises (e.g. an experimental
    `"seeded"` source from a pre-#110 dev run), a missing `currency`, or a
    null `platform` must NOT 500 the detail page. Strict `PriceHistory`
    rejects every one of those shapes — exactly the same family of bug
    that motivated `ClaimReadTolerant` and `PurchaseReadTolerant` in PR
    #142/#144.

This class is for READS ONLY. Never round-trip a `PriceHistoryReadTolerant`
back into a write — `COLLECTION_MODELS["price_history"]` stays pinned to
the strict `PriceHistory` in `client.py`, which is the only path that
hits `db.upsert`. The strict-on-write guarantee is identical to the
Claim / Purchase tolerant pair.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, Field

from .base import BaseDocument


class PriceHistoryReadTolerant(BaseDocument):
    """Tolerant variant of `PriceHistory`.

    Field annotations track `PriceHistory` 1:1 except:

    - Enum-typed fields (`platform`, `source`) are `str | None` — verbatim
      pass-through.
    - The `currency: Literal["USD"]` constraint is widened to `str | None`
      so a legacy row with a non-USD value (theoretical today but possible
      under a future multi-currency expansion) still loads.
    - Required scalars (`purchase_id`, `product_id`, `checked_at`) are
      widened to `T | None`.
    - `Field(ge=0)` constraints on the price fields are dropped — a row
      with a negative or null price still loads, the consumer decides
      whether to plot it.

    Subclasses `BaseDocument` so the generic `MongoDBClient.find_many` /
    `find_one` / `get` helpers accept it directly. `id` is re-declared as
    optional for symmetry with the other tolerant variants.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: UUID | None = Field(default=None, alias="_id")
    updated_at: datetime | None = None

    purchase_id: UUID | None = None
    platform: str | None = None
    product_id: str | None = None
    price_member: float | None = None
    price_non_member: float | None = None
    member_tier_required: str | None = None
    currency: str | None = None
    checked_at: datetime | None = None
    source: str | None = None
    evidence_screenshot_url: str | None = None
    raw_response_hash: str | None = None
