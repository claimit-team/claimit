"""Platform slug → human-readable display label.

Python mirror of `apps/web/src/lib/platform-labels.ts`. Keep the two in
sync: any slug or override added on one side should be added on the
other. Email subject + body need the same brand-correct spelling the
in-app notifications use (e.g. "Best Buy" not "best_buy", "IHG" not
"Ihg", "Macy's" with the apostrophe).
"""

from __future__ import annotations

# Keep alphabetized to keep the diff minimal when entries are added.
PLATFORM_LABELS: dict[str, str] = {
    "alaska": "Alaska Airlines",
    "amazon": "Amazon",
    "american": "American Airlines",
    "best_buy": "Best Buy",
    "delta": "Delta",
    "dicks_sporting_goods": "Dick's Sporting Goods",
    "hilton": "Hilton",
    "home_depot": "Home Depot",
    "ihg": "IHG",
    "jcpenney": "JCPenney",
    "jetblue": "JetBlue",
    "lowes": "Lowe's",
    "macys": "Macy's",
    "marriott": "Marriott",
    "southwest": "Southwest",
    "target": "Target",
    "united": "United Airlines",
    "walmart": "Walmart",
}


def get_platform_label(raw: str | None) -> str:
    """Resolve a platform slug to its display label.

    - None / empty → em-dash placeholder matching the FE
    - Known slug → mapped label
    - Unknown slug with no underscore → returned as-is (assume already labeled)
    - Unknown slug with underscores → Title Case fallback (e.g. "best_buy_express"
      → "Best Buy Express")
    """
    if not raw:
        return "—"
    slug = raw.strip().lower()
    if slug in PLATFORM_LABELS:
        return PLATFORM_LABELS[slug]
    if "_" not in raw:
        return raw
    return " ".join(part[:1].upper() + part[1:].lower() for part in raw.split("_") if part)
