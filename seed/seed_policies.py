"""Seed the 26 platform policies into MongoDB.

Reads every JSON file in seed/policies/ and upserts it into the `policies`
collection using the `platform` field as the natural key. Idempotent — safe
to re-run; existing documents are fully replaced with the on-disk version.
"""

import asyncio
import json
import os
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

POLICIES_DIR = Path(__file__).parent / "policies"


async def seed_policies(uri: str | None = None, db_name: str | None = None) -> list[str]:
    """Upsert each policy file into the policies collection.

    Returns the list of platform names processed, in filename order.
    """
    mongo_uri = uri if uri is not None else os.environ.get("MONGODB_URI")
    if not mongo_uri:
        raise ValueError("MONGODB_URI must be set or passed via the uri arg.")

    database = db_name if db_name is not None else os.environ.get("MONGODB_DB", "claimit")

    policy_files = sorted(POLICIES_DIR.glob("*.json"))
    if not policy_files:
        raise ValueError(f"No policy files found in {POLICIES_DIR}")

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)
    try:
        collection = client[database]["policies"]
        processed: list[str] = []
        seen_platforms: set[str] = set()
        for path in policy_files:
            with path.open(encoding="utf-8") as f:
                policy = json.load(f)
            platform = policy["platform"]
            if platform in seen_platforms:
                raise ValueError(f"Duplicate platform '{platform}' in {path.name}")
            seen_platforms.add(platform)
            await collection.replace_one(
                {"platform": platform},
                policy,
                upsert=True,
            )
            processed.append(platform)
        return processed
    finally:
        client.close()


if __name__ == "__main__":
    result = asyncio.run(seed_policies())
    for name in result:
        print(f"✓ {name}")
    print(f"\nSeeded {len(result)} policies.")
