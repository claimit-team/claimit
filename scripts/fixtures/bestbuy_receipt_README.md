# S4 live-pipeline test fixture — Best Buy price-drop receipt

`bestbuy_macbook_pricedrop_receipt.png` — a **synthetic** Best Buy receipt for exercising the
end-to-end price-drop pipeline (upload → confirm → monitor → drop → draft → approve → Gmail).
Upload it to ClaimIt only; it is not a real purchase.

## What's on the receipt
| Field | Value |
|---|---|
| Product | 13" MacBook Neo A18 Pro · 512GB · Silver |
| SKU | 6615875 |
| **Paid price (line item)** | **$899.00** |
| Total (incl. 6% MI tax) | $952.94 |
| Purchase date | 2026-05-22 |
| Member / window | **Non-member (standard) → 15-day** return window |
| Store / txn | #1407 Troy MI · TRANS 152784 |

## Why NON-member (don't "upgrade" it to Plus)
The monitor compares a **member** buyer against the page's `memberPrice`, which the Best Buy
product page often does **not** expose. In that case `compare_prices` returns `is_eligible=False`
(no fallback to customerPrice — see `comparison.py` / `adapters/best_buy.py`), so a Plus-member
receipt can fail to trigger even when the price clearly dropped. A **non-member** receipt compares
against `customerPrice` (the $699 visible on the page) → the reliable path.

## How to run S4 with it
1. Dashboard → **Upload receipt** → choose `bestbuy_macbook_pricedrop_receipt.png`.
2. On the **/confirm** page, set the **product URL** to the live page below (the Best Buy
   adapter scrapes this exact URL — the receipt does not contain it):
   ```
   https://www.bestbuy.com/product/13-inch-macbook-neo-apple-a18-pro-chip-with-6-core-cpu-and-5core-gpu-8gb-memory-512gb-ssd-silver/JJGCQYX92P
   ```
3. Confirm → purchase goes `monitoring`.
4. Force a sweep: `gcloud scheduler jobs run claimit-monitor-cron --location=us-east1 --project=claimit-beta`.

## Expected outcome (why this triggers a claim)
- **Paid $899.00** (receipt) vs **current ~$699.00** (live page `customerPrice`) → **~$200 eligible drop**.
- Purchase date 2026-05-22 is inside the 15-day standard window → monitoring active (expires ~2026-06-06).
- If the monitor logs `cron.ineligible` (live price ≥ paid), the live price changed —
  open the URL, confirm it's still < $899; if not, bump the paid price in `make_receipt.py` and re-generate.

## One same-account caveat
Each tester uses their **own** account, so the same receipt works for everyone (per-user `user_id`).
But **don't upload the same receipt twice on the same account** — the `(user_id, platform, order_id)`
unique index collides on the second upload (issue #225: leaves a stuck "Analyzing" purchase). To re-run
on the same account, dismiss the prior purchase first, or change `TRANS` in `make_receipt.py` and re-generate.

*Regenerate / tweak: `scripts/fixtures/make_receipt.py`.*
