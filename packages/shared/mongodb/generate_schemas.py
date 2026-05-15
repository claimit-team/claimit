"""Generate JSON Schema files from the 6 ClaimIt MongoDB Pydantic models.

Run from packages/shared/mongodb/:

    python generate_schemas.py

Writes one file per collection to ./schemas/<collection_name>.schema.json
using Pydantic's `model_json_schema()`. Intended as a dev-time artifact —
this script is intentionally kept out of the wheel.
"""

from __future__ import annotations

import json
from pathlib import Path

from claimit_mongodb_models import (
    Claim,
    Conversation,
    Policy,
    PriceHistory,
    Purchase,
    User,
)

SCHEMAS_DIR = Path(__file__).parent / "schemas"

COLLECTION_MODELS = {
    "users": User,
    "purchases": Purchase,
    "price_history": PriceHistory,
    "policies": Policy,
    "claims": Claim,
    "conversations": Conversation,
}


def generate_schemas(output_dir: Path = SCHEMAS_DIR) -> list[Path]:
    """Write JSON Schema for each collection. Returns paths written."""
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for collection_name, model in COLLECTION_MODELS.items():
        schema = model.model_json_schema()
        path = output_dir / f"{collection_name}.schema.json"
        path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
        written.append(path)
    return written


if __name__ == "__main__":
    paths = generate_schemas()
    for path in paths:
        print(f"wrote {path.relative_to(Path(__file__).parent)}")
    print(f"\n{len(paths)} schema files written to {SCHEMAS_DIR.name}/.")
