"""Live OCR smoke for `extract_from_blob` (issue #183 reproduction harness).

Runs the real Gemini vision path against a local receipt image and prints
the parsed `ExtractedPurchaseFields` + the would-be Purchase status. Used
to verify the multi-item routing, the purchase_date rule, and the
nullable-field confidence rule end-to-end without a Mongo write or Pub/Sub
event.

NOT a pytest test — this is a developer script. It is NOT run in CI; do
not import it from any committed test.

Usage:
    cd apps/ingest-agent
    GOOGLE_GENAI_USE_VERTEXAI=TRUE uv run python scripts/ocr_smoke.py
    # or with an explicit image:
    GOOGLE_GENAI_USE_VERTEXAI=TRUE uv run python scripts/ocr_smoke.py --image ../../best_buy_receipt.jpeg

Defaults to `<repo-root>/best_buy_receipt.jpeg` — keep this file out of
git (added to .gitignore).

Requirements:
  - `GOOGLE_GENAI_USE_VERTEXAI=TRUE` set in the environment
  - Application Default Credentials (`gcloud auth application-default login`)
    against a project that has the Vertex AI API enabled
"""

from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import os
import sys
from pathlib import Path

# Resolve the repo root from this file's location so the default image
# path works for any contributor with the standard checkout layout.
# apps/ingest-agent/scripts/ocr_smoke.py → parents[3] is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_IMAGE = REPO_ROOT / "best_buy_receipt.jpeg"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--image",
        type=Path,
        default=DEFAULT_IMAGE,
        help=f"Path to the receipt image (default: {DEFAULT_IMAGE}).",
    )
    parser.add_argument(
        "--mime-type",
        type=str,
        default=None,
        help="Override MIME type. Defaults to a guess from the file extension.",
    )
    return parser.parse_args()


def _guess_mime(path: Path, override: str | None) -> str:
    if override is not None:
        return override
    guess, _ = mimetypes.guess_type(str(path))
    if guess in {"image/jpeg", "image/png", "application/pdf"}:
        return guess
    # mimetypes returns image/jpeg for .jpg but some environments lack it.
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".pdf":
        return "application/pdf"
    raise SystemExit(f"Cannot determine MIME type for {path} — pass --mime-type explicitly.")


async def _run(image_path: Path, mime_type: str) -> None:
    # Import lazily so --help works without the agent dependency tree.
    from src.extractor import extract_from_blob
    from src.finalize import _compute_status_and_confidence

    data = image_path.read_bytes()
    print(f"=== OCR smoke for {image_path} ({len(data)} bytes, {mime_type}) ===\n")
    extracted = await extract_from_blob(data=data, mime_type=mime_type)

    print("--- Extracted fields ---")
    print(extracted.model_dump_json(indent=2))

    status, confidence, product_id, fallback_used = _compute_status_and_confidence(extracted)
    print("\n--- Resolved status (no Mongo write) ---")
    print(
        json.dumps(
            {
                "status": status,
                "product_id": product_id,
                "fallback_used": fallback_used,
                "confidence_payload": confidence,
                "line_items_detected": extracted.line_items_detected,
            },
            indent=2,
            default=str,
        )
    )


def main() -> None:
    args = _parse_args()
    if not args.image.exists():
        raise SystemExit(f"Image not found: {args.image}")
    if os.getenv("GOOGLE_GENAI_USE_VERTEXAI") != "TRUE":
        print(
            "warning: GOOGLE_GENAI_USE_VERTEXAI is not set to TRUE — the genai "
            "client may fall back to API key auth and hit a different model "
            "surface than production.",
            file=sys.stderr,
        )
    mime_type = _guess_mime(args.image, args.mime_type)
    asyncio.run(_run(args.image, mime_type))


if __name__ == "__main__":
    main()
