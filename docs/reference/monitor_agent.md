# Monitor Agent

The Monitor Agent tracks prices across platforms after a purchase is confirmed, captures evidence of price changes, auto-resolves product URLs when missing, and publishes `price.dropped` events when a refund-eligible drop is detected.

---

## Responsibilities

1. **Price monitoring** — Fetch current prices from platform adapters on a cadence-aware schedule
2. **Evidence capture** — Take timestamped screenshots as proof of lower prices
3. **Product URL resolution** — Auto-discover product URLs from receipt data when the user doesn't provide one
4. **Drop detection** — Compare current price against purchase price and policy rules; publish events when eligible
5. **Window tracking** — Expire monitoring when the platform's claim window closes

---

## Pub/Sub Events

| Direction | Event | Trigger |
| --- | --- | --- |
| **Subscribes** | `purchase.ingested` | New purchase confirmed → Monitor begins tracking |
| **Publishes** | `price.dropped` | Eligible price drop detected → Claim Agent drafts a claim |

---

## Cadence-Aware Scheduling

Cloud Scheduler triggers `POST /cron` every 15 minutes. Each tick, the Monitor Agent computes a per-purchase cadence based on how much time remains in the claim window. A purchase is "due" when `last_checked_at + cadence ≤ now`.

| Time Remaining | Cadence | Constant |
| --- | --- | --- |
| > 7 days | 360 min (6 hours) | `CADENCE_LONG_MIN` |
| 1–7 days | 60 min (1 hour) | `CADENCE_MID_MIN` |
| < 24 hours | 15 min | `CADENCE_SHORT_MIN` |

---

## Product URL Resolution

Receipts rarely include the product URL. Without it, the price adapter can't fetch current prices. The Monitor Agent auto-resolves URLs using the platform name and product name from the receipt.

```
purchase.ingested received (product_url is null)
    │
    ▼
Search via platform adapter (ScraperAPI + Google Search)
    │
    ├── Best Buy: structured Google → render-search fallback
    ├── Target: structured Google → RedSky API
    └── (other platforms: adapter-specific search)
    │
    ▼
Confidence score candidates (MIN_CONFIDENCE = 0.5)
    │
    ├── Best candidate found → write product_url to purchase doc
    │                          → notify: "Product link found"
    │
    └── No candidate found → notify: "Product link not found"
                              → cron retries on subsequent ticks
```

### Four Resolution Scenarios

| Scenario | Condition | Notification |
| --- | --- | --- |
| `already_valid` | User provided a working URL | None (fast path) |
| `resolved` | URL was missing; system found one | "Product link found" |
| `corrected` | User entered wrong URL; system found correct one | "Product link verified" |
| `unresolved` | System couldn't find a match | "Product link not found" (Pub/Sub path only; cron retries silently) |

---

## Price Check and Drop Detection

```
Cron tick fires
    │
    ▼
Query: purchases where status=monitoring AND window not expired
    │
    ▼
For each purchase:
    ├── Resolve product_url if missing (lazy resolve)
    ├── Fetch current price via platform adapter
    ├── Capture screenshot evidence
    ├── Write price observation to price_history collection
    │
    ▼
Compare: current_price < purchase.price_paid? (tier-matched)
    │   - Member-only prices for non-members are not valid drops
    │   - Any positive drop qualifies — no minimum $/% threshold
    │
    ├── No drop → continue monitoring
    │
    └── Drop detected
        │
        ▼
    Check policy eligibility (eligibility.validate_eligibility):
      - Within claim window?
      - Policy covers own-price drops?
      - No exclusion applies? (sale items, basic economy, award fares)
        │
        ├── Eligible → publish price.dropped
        └── Not eligible → log reason, continue monitoring
```

![Monitor Agent architecture](images/monitor_agent.png)

### Evidence Capture

Every price check produces a timestamped screenshot stored in a GCS evidence bucket. The screenshot URL is recorded in the `price_history` collection alongside the numeric price. This evidence is displayed in the claim detail page's Evidence pane and can be included in email claim attachments.

---

## Platform Adapters

Each platform has a dedicated adapter that knows how to fetch the current price from that platform's website or API. Adapters handle:

- URL normalization (strip tracking params, follow redirects)
- Price extraction (HTML scraping or API response parsing)
- Anti-bot mitigation (ScraperAPI proxy, render fallback for JavaScript-heavy sites)
- Rate limiting and caching

Currently, live adapters exist for Best Buy and Target. Other platforms use seeded price data for demonstration.

---

## Key Files

| Path | Role |
| --- | --- |
| `apps/monitor-agent/src/main.py` | Pub/Sub handler for `purchase.ingested`, cron entry point |
| `apps/monitor-agent/src/cron.py` | Cron-triggered monitoring loop with lazy URL resolution |
| `apps/monitor-agent/src/cadence.py` | Window-proximity cadence ladder (15/60/360 min) |
| `apps/monitor-agent/src/comparison.py` | Member-tier-aware price comparison logic |
| `apps/monitor-agent/src/eligibility.py` | Policy rules engine — window, exclusions, drop validation |
| `apps/monitor-agent/src/resolver/service.py` | `_resolve_and_persist` — URL resolution orchestrator |
| `apps/monitor-agent/src/resolver/target.py` | Target adapter (ScraperAPI + RedSky API) |
| `apps/monitor-agent/src/resolver/best_buy.py` | Best Buy adapter (Google Search + render fallback) |
| `apps/monitor-agent/src/adapters/` | Platform-specific price fetching adapters (best_buy, target, seeded) |

---

→ Back to [Architecture](architecture.md)
