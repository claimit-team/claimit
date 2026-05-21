#!/usr/bin/env python3
"""Manual acceptance gate for `extract_from_blob` (ticket 5.14, A3).

The unit tests in `apps/ingest-agent/tests/test_extractor.py` mock the
Gemini Runner so they validate the *adapter shape* only — they do NOT
prove that the existing text-tuned `EXTRACTOR_SYSTEM_PROMPT` extracts
reasonable fields from an actual image / PDF.

This script is the manual gate. It runs `extract_from_blob` against
one real receipt image and one real receipt PDF (paths passed on the
CLI) and pretty-prints the parsed `ExtractedPurchaseFields`. The
operator eyeballs:

  - platform / category match the receipt
  - product_name + price_paid + order_id + purchase_date are present
    and look right
  - extraction_confidence.overall_min is roughly proportional to how
    clean the receipt is

Decision matrix per the 5.14 plan:

  - All four critical fields populated with sensible values → green;
    proceed to A4.
  - Fields are blank / wildly wrong AND the issue is OCR-style
    ambiguity → green (low confidence is the correct surface; A4's
    finalize will route this to pending_confirmation as designed).
  - Fields are blank because the model didn't recognize the format
    as a receipt at all → tweak `VISION_USER_INSTRUCTION` (a minimal
    user-message hint, NOT the system prompt) and re-run.

Usage (from repo root, with Application Default Credentials that can
hit Vertex AI for the configured project):

    uv run --project apps/ingest-agent python \\
        scripts/acceptance_extract_from_blob.py \\
        --pdf path/to/sample-receipt.pdf \\
        --image path/to/sample-receipt.jpg

Exits 0 on success (both calls returned a valid `ExtractedPurchaseFields`),
1 on any failure. Output is JSON for easy capture in PR notes.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Pkg lives under apps/ingest-agent/src; we run via `uv run --project
# apps/ingest-agent` so PYTHONPATH already includes it.
from src.extractor import extract_from_blob  # type: ignore[import-not-found]


def _mime_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return "application/pdf"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    raise SystemExit(f"Unsupported file extension {suffix!r} — expected .pdf / .jpg / .jpeg / .png")


async def _run_one(path: Path) -> dict[str, object]:
    mime = _mime_type_for(path)
    data = path.read_bytes()
    if not data:
        raise SystemExit(f"{path} is empty")
    print(f"\n=== Extracting {path.name} ({mime}, {len(data)} bytes) ===", flush=True)
    result = await extract_from_blob(data=data, mime_type=mime)
    return result.model_dump(mode="json")


async def _main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pdf",
        type=Path,
        required=True,
        help="Path to a sample receipt PDF.",
    )
    parser.add_argument(
        "--image",
        type=Path,
        required=True,
        help="Path to a sample receipt JPEG/PNG.",
    )
    args = parser.parse_args()

    failures: list[str] = []
    results: dict[str, object] = {}

    for label, path in [("pdf", args.pdf), ("image", args.image)]:
        try:
            parsed = await _run_one(path)
        except Exception as exc:
            failures.append(f"{label} ({path}): {exc!r}")
            continue
        results[label] = parsed
        print(json.dumps(parsed, indent=2, default=str), flush=True)

    print("\n=== Summary ===", flush=True)
    print(json.dumps({"results": results, "failures": failures}, indent=2, default=str))

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
