"""Per-collection projections — re-exported from `claimit-elastic`.

The canonical definitions live in `packages/shared/elastic/projections.py`
so the sync worker and the initial-backfill script index the same field
set. Keep this module a pure re-export; edit the source in the elastic
package instead of duplicating logic here.
"""

from elastic.projections import (
    project_claim,
    project_policy,
    project_price_history,
    project_purchase,
)

__all__ = [
    "project_claim",
    "project_policy",
    "project_price_history",
    "project_purchase",
]
