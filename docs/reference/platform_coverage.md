# Platform Coverage

ClaimIt maintains source-linked policy fixtures for **26 platforms** across retail, airlines, and hotels. Of these, **24 have active price-protection policies** — Amazon and Walmart are tracked but currently inactive (no post-purchase price-match program). All policies were last verified on **May 14, 2026**.

Three platforms run fully live end-to-end flows (Best Buy, Southwest, Hilton). The remaining use seeded price data to demonstrate coverage. Adding a new platform requires only a policy fixture and a price-check adapter — no changes to the agent pipeline.

---

## Retail (15 platforms, 13 active)

| Platform | Window | Member Window | Claim Type | Own Drops | Competitor | Loyalty Req. | Key Exclusions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Best Buy** | 15 days | 60 days | Chat script | ✓ | ✗ | ✗ | Marketplace 3P, clearance, open-box, BF/Cyber week |
| **Target** | 14 days | — | Chat script | ✓ | ✗ | ✗ | Competitor matches discontinued Jul 2025; RedCard stacking |
| **Dick's Sporting Goods** | 14 days | — | Chat script | ✓ | ✓ | ✗ | Clearance, doorbusters |
| **JCPenney** | 14 days | — | In-store | ✓ | ✓ | ✗ | Clearance, special buys |
| **Staples** | 14 days | — | In-store | ✓ | ✓ | ✗ | Marketplace 3P, no online claim path |
| **Macy's** | 10 days | — | Email | ✓ | ✓ | ✗ | Doorbusters, Specials, Last Act, limited competitor list |
| **Nordstrom** | 10 days | — | Email | ✓ | ✓ | ✗ | Anniversary Sale, final sale, limited competitor list |
| **Newegg** | 7 days | — | Email | ✓ | ✗ | ✗ | Marketplace 3P, open-box |
| **Costco** | 30 days | — | Email | ✓ | ✓ | ✓ | Limited promos, gas station, food court |
| **Dell** | 30 days | — | Email | ✓ | ✓ | ✗ | B2B/commercial accounts, refurbished |
| **Home Depot** | 30 days | — | Email | ✓ | ✓ | ✗ | Auctions, closeouts, special orders |
| **Lowe's** | 30 days | — | Email | ✓ | ✓ | ✗ | Clearance, going-out-of-business sales |
| **Crutchfield** | 60 days | — | Email | ✓ | ✓ | ✗ | Clearance, scratch-and-dent, authorized dealers only |
| ~~Amazon~~ | 0 | — | — | ✗ | ✗ | — | **Inactive** — no formal post-purchase price-match policy |
| ~~Walmart~~ | 0 | — | — | ✗ | ✗ | — | **Inactive** — no post-purchase price-match policy |

**Notes:**

- Best Buy is the only retail platform with a member-extended window (My Best Buy members: 60 days vs. standard 15 days)
- Costco is the only retail platform requiring loyalty membership
- Claim types vary: chat script (Best Buy, Target, Dick's), in-store (JCPenney, Staples), email (all others)

---

## Airlines (6 platforms, all active)

| Platform | Window | Claim Type | Own Drops | Competitor | Key Exclusions |
| --- | --- | --- | --- | --- | --- |
| **Southwest** | 365 days | Self-service | ✓ | ✗ | Award/Rapid Rewards excluded from cash refund; difference refunded as points |
| **United** | 365 days | Self-service | ✓ | ✗ | Basic Economy excluded; credit issued as Future Flight Credit (1-year expiry) |
| **Alaska** | 1 day | Email | ✓ | ✓ | 24h from booking; refund as voucher, not original tender; claim form required |
| **American** | 1 day | Self-service | ✓ | ✗ | Must cancel and rebook (no in-place adjustment); 24h from booking |
| **Delta** | 1 day | Self-service | ✓ | ✗ | Must cancel and rebook; 24h from booking |
| **JetBlue** | 1 day | Email | ✓ | ✗ | Same calendar day only (resets midnight); minimum $5 fare drop; TrueBlue credit only |

**Notes:**

- Southwest and United have 365-day windows — dramatically longer than other airlines
- No airline requires loyalty membership
- No airline covers competitor drops (except Alaska)
- JetBlue is the only platform across all categories with a minimum drop threshold ($5)
- All 1-day airline windows are measured from booking timestamp, not calendar days

---

## Hotels (5 platforms, all active)

| Platform | Window | Claim Type | Own Drops | Competitor | Pre-Arrival Req. | Key Exclusions |
| --- | --- | --- | --- | --- | --- | --- |
| **Hilton** | 1 day | Email | ✓ | ✓ | — | Hilton Honors required; publicly-available rate only; identical-room rule |
| **Hyatt** | 1 day | Email | ✓ | ✓ | — | World of Hyatt required; strict identical-conditions rule |
| **IHG** | 1 day | Email | ✓ | ✓ | — | IHG One Rewards required; regional 48h pre-arrival rule may apply |
| **Marriott** | 1 day | Email | ✓ | ✓ | — | Marriott Bonvoy required; strict identical-room rule (incl. bed type) |
| **Wyndham** | 1 day | Email | ✓ | ✓ | 48 hours | Wyndham Rewards required; must file ≥48h before check-in; identical-room rule |

**Notes:**

- All hotels require loyalty membership
- All hotels cover competitor drops (unlike retail and airlines)
- All hotels have 1-day windows and use email as the claim channel
- Wyndham is the only hotel with an explicit pre-arrival filing requirement (48 hours)
- "Identical-room rule" means: same hotel, dates, room type, bed type, cancellation policy, and rate type must match

---

## Claim Type Distribution

| Claim Type | Retail | Airlines | Hotels | Total |
| --- | --- | --- | --- | --- |
| **Email** | 8 | 2 | 5 | 15 |
| **Chat Script** | 3 | 0 | 0 | 3 |
| **In-Store** | 2 | 0 | 0 | 2 |
| **Self-Service** | 0 | 4 | 0 | 4 |

---

## Live vs. Seeded

| Status | Platforms | Description |
| --- | --- | --- |
| **Live** (3) | Best Buy, Southwest, Hilton | Full end-to-end: receipt → monitoring → price check → claim draft → submission |
| **Seeded** (21) | All other active platforms | Policy fixtures verified against published terms; price data and claims seeded for demonstration |
| **Inactive** (2) | Amazon, Walmart | Tracked for analytics; no claimable policy exists |

---

## Data Note: Enum vs. Fixture Mismatch

The `Platform` enum in `claimit_mongodb_models/enums.py` currently defines only 10 values. The remaining 16 platforms exist as policy fixtures in MongoDB but have no corresponding enum member. Since `Policy.platform` is typed as `str` (not the `Platform` enum), this does not cause validation failures at runtime. Aligning the enum with the full fixture set is a planned cleanup.

---

→ Back to [ClaimIt](../../README.md)
