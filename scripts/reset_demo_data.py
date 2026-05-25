#!/usr/bin/env python3
"""Full reset of the demo user's transactional data — QA clean slate.

Deletes ALL of the demo user's documents (NOT just `_seed`-tagged rows) in:
    claims, purchases, price_history, conversations, notification_events
so every QA round starts from an identical state before re-seeding.

Leaves `users` and `policies` untouched. Targets the PROD app DB `claimit`
(the same Atlas cluster the API uses) — deliberate; the demo account's data is mock.

Usage (from repo root):
    MONGODB_URI=$(gcloud secrets versions access latest \\
        --secret=mongodb-uri --project=claimit-beta) \\
        uv run --project apps/api-gateway python scripts/reset_demo_data.py

Add --yes to skip the interactive confirmation (used by qa_reset.sh).
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import os
import sys
from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorClient

PROD_DB = "claimit"
DEMO_EMAIL = "claimitbeta@gmail.com"
COLLECTIONS = ["claims", "purchases", "price_history", "conversations", "notification_events"]


def _user_id_candidates(raw_id: object) -> list[object]:
    """Match user_id whether stored as BSON UUID or string."""
    candidates: set[object] = {raw_id}
    with contextlib.suppress(Exception):
        candidates.add(str(raw_id))
    with contextlib.suppress(ValueError, TypeError):
        candidates.add(UUID(str(raw_id)))
    return list(candidates)


async def _run(yes: bool) -> int:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("ERROR: MONGODB_URI is required.", file=sys.stderr)
        print(
            "Source it via: MONGODB_URI=$(gcloud secrets versions access latest "
            "--secret=mongodb-uri --project=claimit-beta)",
            file=sys.stderr,
        )
        return 1

    client = AsyncIOMotorClient(uri, uuidRepresentation="standard")
    db = client[PROD_DB]

    user = await db["users"].find_one({"email": DEMO_EMAIL})
    if not user:
        print(f"ERROR: demo user {DEMO_EMAIL!r} not found in `users`.", file=sys.stderr)
        return 1

    query = {"user_id": {"$in": _user_id_candidates(user["_id"])}}
    print(f"Demo user {DEMO_EMAIL} -> {user['_id']}  (db={PROD_DB!r})")

    counts = {c: await db[c].count_documents(query) for c in COLLECTIONS}
    print("About to delete: " + ", ".join(f"{c}={n}" for c, n in counts.items()))

    if not yes:
        ans = input("Type 'wipe' to confirm a FULL reset of the demo user's data: ")
        if ans.strip().lower() != "wipe":
            print("Aborted — nothing deleted.")
            return 1

    for c in COLLECTIONS:
        res = await db[c].delete_many(query)
        print(f"  cleared {c}: {res.deleted_count}")

    print("Reset complete. (Re-seed next: seed/seed_policies.py + scripts/seed_claims_demo.py)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()
    return asyncio.run(_run(args.yes))


if __name__ == "__main__":
    raise SystemExit(main())
