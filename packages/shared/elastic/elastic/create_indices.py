"""Idempotent Elasticsearch index creation for ClaimIt.

Creates 4 indices per master doc §7.6. Safe to run multiple times —
`ignore_status=400` swallows the "index already exists" response.
"""

import asyncio
import os

from elasticsearch import AsyncElasticsearch

INDEX_DEFINITIONS: dict[str, dict] = {
    "policies-fulltext": {
        "mappings": {
            "properties": {
                "platform": {"type": "keyword"},
                "category": {"type": "keyword"},
                "policy_text_full": {"type": "text", "analyzer": "english"},
                "policy_text_relevant_clause": {"type": "text", "analyzer": "english"},
                "key_exclusions": {"type": "keyword"},
                "window_days": {"type": "integer"},
                "covers_own_drops": {"type": "boolean"},
                "covers_competitor_drops": {"type": "boolean"},
                "claim_type": {"type": "keyword"},
                "active": {"type": "boolean"},
            }
        }
    },
    "purchases-search": {
        "mappings": {
            "properties": {
                "user_id": {"type": "keyword"},
                "platform": {"type": "keyword"},
                "product_name": {
                    "type": "text",
                    "analyzer": "standard",
                    "fields": {"keyword": {"type": "keyword"}},
                },
                "category": {"type": "keyword"},
                "status": {"type": "keyword"},
                "purchase_date": {"type": "date"},
                "claim_type": {"type": "keyword"},
                "price_paid": {"type": "scaled_float", "scaling_factor": 100},
            }
        }
    },
    "price-history-analytics": {
        "mappings": {
            "properties": {
                "purchase_id": {"type": "keyword"},
                "platform": {"type": "keyword"},
                "product_id": {"type": "keyword"},
                "price_member": {"type": "scaled_float", "scaling_factor": 100},
                "price_non_member": {"type": "scaled_float", "scaling_factor": 100},
                "source": {"type": "keyword"},
                "checked_at": {"type": "date"},
            }
        }
    },
    "claims-analytics": {
        "mappings": {
            "properties": {
                "platform": {"type": "keyword"},
                "outcome": {"type": "keyword"},
                "denial_reason_extracted": {"type": "keyword"},
                "claim_amount": {"type": "scaled_float", "scaling_factor": 100},
                "submitted_at": {"type": "date"},
                "resolved_at": {"type": "date"},
                "outcome_note": {"type": "text", "analyzer": "english"},
                "user_id": {"type": "keyword"},
            }
        }
    },
}


async def create_indices(es: AsyncElasticsearch | None = None) -> list[str]:
    """Create all 4 indices. Returns list of created/existing index names."""
    close_after = False
    if es is None:
        es = AsyncElasticsearch(
            os.environ["ELASTIC_URL"],
            api_key=os.environ["ELASTIC_API_KEY"],
        )
        close_after = True

    created: list[str] = []
    try:
        for name, body in INDEX_DEFINITIONS.items():
            response = await es.options(ignore_status=400).indices.create(
                index=name,
                mappings=body["mappings"],
            )
            error_type = response.get("error", {}).get("type")
            if error_type and error_type != "resource_already_exists_exception":
                raise RuntimeError(f"Failed to create index '{name}': {response.get('error')}")
            created.append(name)
    finally:
        if close_after:
            await es.close()
    return created


if __name__ == "__main__":
    result = asyncio.run(create_indices())
    for name in result:
        print(f"✓ {name}")
