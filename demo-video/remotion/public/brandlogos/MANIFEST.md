# Brand Logos — Manifest

> Assets for ClaimIt demo-video visual beats (Architecture, Credibility, Implementation
> Proof, Payoff). Slugs map to `{slug}.svg` in this folder (except `phoenix.png`).
> **Fetched**: 2026-06-03 (via `curl`). Beat numbers refer to **BEAT_SHEET v3.1**.
> **Licensing note (read before commercial release)**: all marks are trademarks of their
> respective owners. ClaimIt is not affiliated with or endorsed by any of these companies.
> Logos are used for **accurate identification of integrations / retailers** (nominative
> fair use). Confirm each company's brand guidelines before any commercial/public release.

## Tech stack (Tier 1–2)

| slug | source URL | license / usage note | demo beats |
|---|---|---|---|
| `google` | https://cdn.simpleicons.org/google | Simple Icons (icon file CC0; Google logo © Google). "Built on / powered by" identification. | 5–9, 35 |
| `googlecloud` | https://cdn.simpleicons.org/googlecloud | Simple Icons (CC0 file; © Google). Stands in for Cloud Run / Scheduler in the arch diagram. | 5–9, 30–34, 35 |
| `googlegemini` | https://cdn.simpleicons.org/googlegemini | Simple Icons (CC0 file; © Google). | 6, 19, 31, 35 |
| `mongodb` | https://cdn.simpleicons.org/mongodb | Simple Icons (CC0 file; © MongoDB). | 7, 32, 35 |
| `elasticsearch` | https://cdn.simpleicons.org/elasticsearch | Simple Icons (CC0 file; © Elastic). Arch-diagram only (no locked VO beat in v3.1). | (arch diagram, optional) |
| `gmail` | https://cdn.simpleicons.org/gmail | Simple Icons (CC0 file; © Google). | 5, 11, 26 |
| `googlepubsub` | **pre-existing** (prior session; source unverified — likely GCP icon set) | Verify source/license before release. Covers Cloud Pub/Sub in arch diagram. | 5–9 (arch diagram) |

All Tier-1 SVGs are **brand-colored** (e.g. `fill="#4285F4"` Google, `#47A248` MongoDB, `#8E75B2` Gemini); recolor in the shim if a monochrome "powered-by" wall is preferred.

## Retailers (Tier 4) — Credibility beat 29 + Refund hero

| slug | source URL | license / usage note | demo beats |
|---|---|---|---|
| `costco` | https://commons.wikimedia.org/wiki/Special:FilePath/Costco_Wholesale_logo_2010-10-26.svg | Wikimedia Commons. © Costco Wholesale; trademark used for nominative identification. **HERO retailer** of the refund demo. | 10–27 (hero), 29 |
| `bestbuy` | https://commons.wikimedia.org/wiki/Special:FilePath/Best_Buy_logo_2018.svg | Wikimedia Commons. © Best Buy; nominative fair use for accurate identification in the retailer set. | 29 |
| `target` | https://cdn.simpleicons.org/target | Simple Icons (CC0 file; © Target). Nominative identification in Beat 29 retailer grid. | 29 |
| `macys` | https://cdn.simpleicons.org/macys | Simple Icons (CC0 file; © Macy's). Nominative identification in Beat 29. | 29 |
| `dell` | https://cdn.simpleicons.org/dell | Simple Icons (CC0 file; © Dell). Nominative identification in Beat 29. | 29 |

> `costco` + `bestbuy` are **not on Simple Icons** (retailer marks removed for trademark
> reasons), so they were sourced from **Wikimedia Commons** (priority-2 fallback). These are
> the only assets not from the requested Simple Icons CDN — flagged here for transparency.

## Observability (Tier 3)

| slug | source | license / usage note | demo beats |
|---|---|---|---|
| `phoenix.png` | user-supplied (presumed sourced from Arize Phoenix marketing materials) | © Arize AI. Used for accurate identification of the Arize Phoenix integration. **Real logo, verified**: RGBA PNG, 400×400, alpha channel present → **transparent background** (no tRNS chunk needed), ~31 KB, valid PNG (intact IEND). | 33, 35 |

## Not fetched — manifest notes (no file)

| item | why | recommendation |
|---|---|---|
| **Google ADK** | ADK is the Agent Development Kit Python library; it has no standalone product logo (per spec). | Use `googlegemini` / `googlecloud` + a **text label "ADK"** in beats 31. No file needed. |
| **Cloud Run** | Not a Simple Icons brand; official icon lives in the GCP product icon set (https://cloud.google.com/icons), not a direct `curl` URL. | Stand in with `googlecloud.svg` + "Cloud Run" label, or fetch the official GCP icon set zip manually. |
| **Cloud Scheduler** | Same as Cloud Run (GCP product icon set). | Same — `googlecloud.svg` + label, or official GCP icon. |

## Pre-existing (prior session, not in this fetch list)

| slug | note |
|---|---|
| `nextdotjs` | Next.js mark — web stack; not used in any v3.1 VO beat. |
| `vercel` | Vercel mark — not used in any v3.1 VO beat. |

## Summary

- **Fetched OK this session**: 11 — `google, googlecloud, googlegemini, mongodb, elasticsearch, gmail` (Simple Icons), `target, macys, dell` (Simple Icons), `costco, bestbuy` (Wikimedia Commons).
- **Phoenix logo**: ✅ real `phoenix.png` (user-supplied, RGBA 400×400, transparent bg); placeholder `phoenix.svg` removed.
- **Reused pre-existing**: `googlepubsub` (covers Pub/Sub), `nextdotjs`, `vercel`.
- **Notes-only (no file)**: Google ADK, Cloud Run, Cloud Scheduler.
- **No source required login/CAPTCHA/paywall.** Wikimedia + Simple Icons + GitHub raw only.
