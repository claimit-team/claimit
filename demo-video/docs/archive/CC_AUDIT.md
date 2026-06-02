# Claude Code Audit — Remotion Capability + UIUX Truth

Generated 2026-06-01. Pre-flight for the next round of ClaimIt demo work. **No source under `apps/web/` was modified.** Capability tests live at `demo-video/remotion/src/_cap_tests.tsx`; renders at `demo-video/remotion/out/cap_tests/`.

---

## Part 1 — Remotion Capability Verification

Each capability was implemented as a minimal Remotion composition that **reuses the real apps/web `Card` + `Badge` shadcn components** (via the validated `@/components/ui/*` alias) so the verdicts apply to the production reuse path, not a toy sandbox.

### 1.1 Localized depth-of-field — ✅ VIABLE, no jitter

**Test composition**: `CapTest1` (frames 0–120).
- Two real apps/web `<Card>` subtrees side-by-side, each containing `<Badge>` + body text + nested cards.
- Right card receives `filter: blur(0 → 8 → 0)px` + `opacity: 1 → 0.15 → 1` interpolated over the timeline.
- Left card stays sharp.
- Both wrapped in `willChange: "filter, opacity"`.

**Result** (`out/cap_tests/dof.mp4`, `dof-mid.png`):
- Blur applies cleanly to the entire shadcn Card subtree — header, badges, nested card-within-card, dashed borders. No layout shift.
- `filter: blur(8px)` is a GPU-composited paint operation; it does NOT trigger React re-renders or DOM reflow. The blurred subtree's bounding box stays at the exact same coordinates as its sharp counterpart.
- Visual confirms: at frame 45 the right card is heavily blurred + dimmed; the left card's text edges are pixel-sharp. No anti-alias shimmer between adjacent frames.

**Recommended implementation pattern** for the production demo (e.g., blur Evidence + Assistant panes while keeping Draft pane sharp inside `ClaimDetailShell`):

```tsx
// Per-pane DOF wrapper. Apply via wrapping the ResizablePanel child, not
// the ResizablePanel itself (the wrapper sits *inside* the panel so
// react-resizable-panels' layout math isn't touched).
<RackFocus focus={paneFocus} maxBlurPx={8} minSaturation={0.55}>
  <EvidencePane claim={claim} />
</RackFocus>
```

The existing `src/polish/RackFocus.tsx` already encodes this pattern. **Use it as-is.** Sub-pixel blur amounts (e.g., 7.6px) are fine — blur is anti-aliased internally by Chromium's rasterizer, no shimmer.

**Limits**:
- `filter: blur(N)` past ~16px starts costing render time noticeably. Up to 12px is free.
- If the blurred subtree contains its own `filter:` (e.g., a Bloom inside) the filters compound. The blur should be applied at the OUTER wrapper only.
- Mixing `filter: blur` with `mix-blend-mode: overlay` produces unpredictable results in headless Chrome. The Grain layer already uses overlay — if you blur a section that has Grain inside, lift the Grain to the parent.

### 1.2 Jitter-free push-in (scale 1.00 → 1.03) — ✅ VIABLE, no glyph re-rasterization

**Test composition**: `CapTest2` (frames 0–120).
- Real apps/web Card + Badge + body text wrapped in `transform: scale(1.00 → 1.03)` over 90 frames.
- `willChange: "transform"`, `transformOrigin: "center center"`.
- Wrapper has zero `translate` and zero size changes — only the scale.

**Result** (`out/cap_tests/pushin.mp4`, `pushin-end.png`):
- Inter glyphs stay crisp through the entire 0–90 frame ramp. No re-rasterization shimmer.
- This works because (a) `transform: scale()` is a GPU-composited transform that does NOT trigger re-layout, (b) Chromium rasterizes the wrapped subtree to a layer texture once and resamples it per frame, (c) the scale magnitude is small enough that the resampled texture stays visually identical between frames.

**Recommended implementation pattern**:

```tsx
// Use ONLY transform: scale for the push-in. No width/height changes.
// Wrap the entire scene to be pushed-in at the OUTERMOST layer so
// nothing inside it has to compute against the new scale.
const pushIn = interpolate(frame, [0, 90], [1, 1.03], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.16, 1, 0.3, 1),
});
return (
  <div style={{
    transform: `scale(${pushIn.toFixed(5)})`,
    transformOrigin: "center center",
    willChange: "transform",
  }}>
    <RealClaimDetailShell {...props} />
  </div>
);
```

**Limits**:
- **The Breathe jitter trap**: the prior Breathe regression came from applying scale on the SAME layer that contained other GPU-affecting transforms (translate-y, filter). Keep scale on its own wrapper. Don't combine `scale(...)` with `translate(...)` on the SAME element unless both are whole-pixel/whole-percentage.
- Push-in past scale=1.08 starts showing slight texture sampling softness on Inter at small sizes (< 18px). For the demo's planned 1.00 → 1.03 this is well within the safe zone.
- The `toFixed(5)` is important — JavaScript double-precision repeat-decimals like `1.0333333333333333` change at the 16th digit between frames, which **can** propagate to a sub-pixel transform difference. Truncating to 5 decimals keeps the transform string identical across many frames when the value plateaus.

### 1.3 Stage continuity — ✅ VIABLE, use AbsoluteFill stacked siblings

**Test composition**: `CapTest3` (frames 0–120).
- Two placeholder cards (price-chart left, three-pane right) rendered as **siblings inside the same `position: relative; width:1080; height:520` parent**.
- Each placeholder wrapped in `<div style={{position:"absolute", inset:0, opacity}}>`.
- Cross-fade: chart opacity 1→0 frames 30–60; pane opacity 0→1 frames 60–90 (with a 30-frame middle hold).

**Result** (`out/cap_tests/swap.mp4`, `swap-mid.png`, `swap-end.png`):
- Both placeholders render at **the exact same screen rectangle** — the outer card's bounding box is identical between the chart state and the three-pane state.
- The cross-fade is clean: at frame 45 the chart is fully visible; at frame 90 the pane is fully visible; in between (e.g. frame 60) both render at 50% opacity stacked, no visible position shift.

**Recommended implementation pattern**:

```tsx
// Single "stage" container with FIXED dimensions + position. The two
// scenes are absolute-inset siblings; cross-fade by interpolating
// opacity. The container itself never reflows.
<div style={{position:"relative", width:STAGE_W, height:STAGE_H}}>
  <div style={{position:"absolute", inset:0, opacity:chartOpacity}}>
    <PurchaseDetailPriceChart {...chartProps} />
  </div>
  <div style={{position:"absolute", inset:0, opacity:paneOpacity}}>
    <ClaimDetailShell {...shellProps} />
  </div>
</div>
```

**Do NOT use** `<Sequence>` for this — Sequence stacks at the TIMELINE level, not the COORDINATE level. The container would unmount between sequences if their times don't overlap; the two scenes would render at different DOM mount times, the second scene reflowing its panes on first render.

**Do NOT use** `<TransitionSeries>` for this — TransitionSeries presentations crossfade the entire viewport, not a sub-region. The container would resize to viewport size.

**Limits**:
- Both scenes are mounted for the whole timeline; both run their effects, both pay re-render cost. For very heavy scenes (e.g., a full price-chart + full three-pane), keep the offscreen scene wrapped in `opacity:0` (it still renders) — if you need to fully skip render, use a `if (opacity < 0.01) return null` gate, but that does cause first-frame layout flash when it comes back. Cross-fade with `opacity` is the more reliable approach.
- For the shells specifically: the real `ClaimDetailShell` uses `react-resizable-panels` which measures DOM on mount. If the second scene mounts mid-cross-fade with `opacity:0`, its first measured layout may differ from its eventual rendered layout. Mount BOTH scenes at frame 0 with the offscreen one at `opacity:0`, not at the moment the cross-fade begins.

---

## Part 2 — UIUX Truth Audit

Verbatim values extracted from `apps/web` source. Citations are file:line.

### 2.1 Price chart (`/purchases/[id]` — Recharts)

#### Data shape

**`PriceHistoryPointVm`** — `apps/web/src/lib/purchase-detail-view.ts:70`:
```ts
export interface PriceHistoryPointVm {
  date: string;        // ISO date string
  price: number;       // dollar amount, two-decimal precision
  dropDetected: boolean;  // true only on FIRST below-paid point
}
```

Built by `buildPriceSeries()` at `purchase-detail-view.ts:324–340`. Real data array is a flat list of these triples. **No sample fixture array exists in the repo** — the chart is fed live from the API. For demo purposes, fabricate ~10 points covering the storyboard's flat-at-$199 → drop-to-$149 arc; mark the day-7 point with `dropDetected: true`.

#### Recharts component props

| Prop | Value | Line |
|---|---|---|
| `<XAxis dataKey>` | `"formattedDate"` (note: NOT `"date"` — there's a pre-format step at `purchase-detail-view.ts:217` that adds a `formattedDate` field via `formatPurchaseShortDate(point.date)`) | 256 |
| `<XAxis tick>` | `{ fill: "var(--neutral-500)", fontSize: 12 }` | 257 |
| `<XAxis tickLine>` | `false` | 258 |
| `<XAxis axisLine>` | `{ stroke: "var(--neutral-200)" }` | 259 |
| `<YAxis domain>` | `[yMin, yMax]` where yMin = `Math.floor(minPrice - padding)`, yMax = `Math.ceil(maxPrice + padding)`, padding = `(maxPrice - minPrice) * 0.1 \|\| 10` | calc at 219–228, applied 263 |
| `<YAxis tick>` | `{ fill: "var(--neutral-500)", fontSize: 12 }` | 264 |
| `<YAxis tickFormatter>` | `currency === "USD" ? \`$${value}\` : formatPurchaseCurrency(value, currency)` | 264–266 |
| `<YAxis tickLine>` | `false` | 267 |
| `<YAxis axisLine>` | `false` | 268 |
| `<YAxis width>` | `60` | 269 |
| `<Line type>` | `"monotone"` | 284 |
| `<Line dataKey>` | `"price"` | 285 |
| `<Line stroke>` | `"var(--neutral-500)"` | 286 |
| `<Line strokeWidth>` | `2` | 287 |
| `<Line dot>` | `<CustomDot pricePaid={pricePaid} />` | 288 |
| `<Line activeDot>` | `{ r: 4, fill: "var(--neutral-500)", stroke: "var(--neutral-0)", strokeWidth: 2 }` | 289–294 |
| `<ReferenceLine y>` | `pricePaid` | 273 |
| `<ReferenceLine stroke>` | `"var(--neutral-200)"` | 274 |
| `<ReferenceLine strokeDasharray>` | `"5 5"` | 275 |
| `<ReferenceLine label>` | `{ value: \`Paid ${formatPurchaseCurrency(pricePaid, currency)}\`, fill: "var(--neutral-500)", fontSize: 11, position: "right" }` | 276–281 |
| `<CustomDot>` | renders `<circle r={6} fill="var(--semantic-warning)" stroke="var(--neutral-0)" strokeWidth={2}/>` ONLY when `payload.price < pricePaid`, else null | 62–76 |

#### Card chrome

- `<Card className="bg-neutral-0">` — `price-history-chart.tsx:245`
- `<CardTitle className="font-semibold text-lg text-neutral-900">Price history</CardTitle>` — line 247 (note: overrides the shadcn CardTitle default of `text-base` to `text-lg`)
- Stats sidebar — three `StatItem` rows:
  - Container: `flex flex-row gap-4 lg:flex-col lg:gap-3`, width `lg:w-48` (192px)
  - Each StatItem (`StatItem` defined 356–366):
    - Wrapper: `flex flex-1 flex-col gap-1 lg:flex-none`
    - Label row: `flex items-center gap-1.5`
    - Label: `text-neutral-500 text-xs`
    - Value: `font-medium text-neutral-900 text-sm tabular-nums`
    - Icon: `size-4 text-neutral-500` — exact icons are `TrendingUp` / `TrendingDown` / `CircleDot` for highest/lowest/current
- Footer caption (`text-xs text-neutral-500`, line 329–343), branches:
  - `monitorErrorCode === "missing_product_url"` → `Searching for the product link · ${platform}`
  - other error → `Last check failed ${errorTimeAgo} · ${platform}`
  - healthy → `Updated ${timeAgo} · from ${platform}`
  - no data → `Waiting for first snapshot from ${platform}`

#### Entrance animation

**None.** No motion@12 / framer-motion / GSAP wrapper anywhere in the page → content → chart import chain. The chart renders synchronously on data resolve; the only motion in the file is `animate-spin` on the loader spinner. **For the demo, any chart entrance animation is invented; the storyboard's "fly-by + drop" arc has no product analogue.**

#### Outer dimensions at 1920×1080 desktop

- Max-width container: `max-w-[960px]` — `purchase-detail-content.tsx:74` — **exactly 960px wide**
- Chart height: `height={280}` (desktop) / `h-[200px]` (mobile `max-md`)
- Chart width: `100%` via Recharts `ResponsiveContainer`
- Chart margin: `{ top: 10, right: 10, left: 0, bottom: 0 }`
- Stats sidebar width: `lg:w-48` (192px), `gap-6` between chart + sidebar

### 2.2 ClaimDetailShell layout at 1920×1080 desktop

#### Outer horizontal split (`claim-detail-shell.tsx`)

- Left **draft**: `<ResizablePanel id="draft" defaultSize={40} minSize={20}>` — line 307
- Right **right-column**: `<ResizablePanel id="right-column" defaultSize={60} minSize={20}>` — line 331

These are PERCENTAGES of the resizable group, not pixels. At 1920×1080 with the AuthenticatedShell sidebar (256px) consuming the left chrome and 64px top header, the shell's usable horizontal area is 1664px → **draft ≈ 666px, right-column ≈ 998px**.

#### Inner vertical split (right column)

- Top **evidence**: `<ResizablePanel id="evidence" defaultSize={60} minSize={15}>` — line 333
- Bottom **assistant**: `<ResizablePanel id="assistant" defaultSize={40} minSize={15}>` — line 339

Usable inner height = 1080 - 64 (top header) - claim-header (~96px) ≈ 920px → **evidence ≈ 552px, assistant ≈ 368px**.

#### AuthenticatedShell chrome (≥ lg breakpoint)

- Left sidebar: `lg:w-64` (256px) — `authenticated-shell.tsx:124`
- Top header: `h-16` (64px) — `authenticated-shell.tsx:132`

#### Pane headers — uniform across all three panes

All three pane headers (Draft, Evidence, Assistant) use the same `<button>` element with `px-4 py-3` padding (`16px 12px` → **~44px tall** including the 14px icon and 14px font line-height + 12 vertical padding).

#### Pane body inner padding

- **EvidencePane**: `<ScrollArea>` → `<div className="space-y-4 p-4">` — 16px padding all sides, 16px gap between child cards
- **AssistantPane** body: `<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">` — 16/16
- **DraftPane** preview body: ScrollArea wraps renderers which each use `p-4` themselves (16px)

#### ResizableHandle

- `resizable.tsx:27–48`. Visual: `bg-border` (= `--color-border` which maps to `oklch(0.922 0 0)` ≈ `#E5E5E5`), 1px wide (`w-px`) vertical or 1px tall (`h-px`) horizontal.
- `withHandle` prop: when `true`, renders a small `h-6 w-1 rounded-lg bg-border` grabber inside. The shell passes `withHandle` on both the outer and inner handles (`claim-detail-shell.tsx:325, 337`).

#### ClaimHeader

- Outer `<div>`: `border-neutral-200 border-b py-3` — 12px vertical padding, 1px bottom border
- Inside container: `space-y-3` (12px gap between breadcrumb row and status/actions row)
- **Total ClaimHeader height ≈ 84–96px** (depends on whether action buttons wrap to a second row)
- Breadcrumb row: small icon button `h-8 w-8` + breadcrumb text (`text-sm`)
- Status/actions row: status badge (`text-xs` pill, ~22px) + meta text + action buttons (`size-sm` = `h-7`)

### 2.3 Social-proof animation (landing page)

Found in **`apps/web/src/components/landing/social-proof-section.tsx`**:

| Property | Value | Line |
|---|---|---|
| Animation library | `motion/react` (motion@12) | 4 |
| Starting value | **0** | 31 (`useMotionValue(0)`) |
| Ending value | **342** | 23 (`amount: 342` in `exampleReportedReclaimed`) |
| Duration | **1.5 s** | 42 |
| Easing | **`"easeOut"`** | 42 |
| Trigger | `useInView(ref, { once: true, amount: 0.4 })` — fires once when 40% of element scrolls into view | 30 |
| Display format | `$342` — dollar prefix + integer, no decimals | 87 |
| Number typography | `text-2xl font-semibold text-brand-accent-500 tabular-nums` | 86 |
| Label below | `"Reclaimed This Month"` (line 89) + qualifier "Example dashboard, based on user-reported results." (line 91) |

**This is the ONLY animated counter on the landing page.** Other stats ("4 Types" and "3 Categories") are static.

> Implementation note: `AnimatedAmount` (lines 28–48) uses `useMotionValue(0)` + `animate(motionValue, target, {duration: 1.5, ease: "easeOut"})` + a `useTransform(... v => Math.round(v))` derivation, then subscribes to changes to update React state. The displayed value is `Math.round`-ed every motion-tick — there's no decimal flicker.

> The user's earlier memory of "$0 → $342" is correct (not $93 → $341).

### 2.4 Real draft fixtures (from `scripts/seed_claims_demo.py:1070–1194`)

The seed script generates these on-the-fly via `_build_draft_content_for_pending()` for the four `DRAFT_PENDING` demo claims. **Quoted VERBATIM with template-literal placeholders preserved (e.g., `demo-ord-{10-char-id}`).**

#### A. CHAT_SCRIPT — Amazon / Anker USB-C Charger

```
Amazon Price Match — Order demo-ord-{10-char-id}

Step 1: Hi! I'd like to request a price match refund on a recent order.
Step 2: Order number demo-ord-{10-char-id} — Anker USB-C Charger.
Step 3: I paid $34.99 but the current price is $15.99 — please refund the $18.99 difference.
Step 4: This falls within the published price match window for Amazon.
Step 5: I have a screenshot of the current lower price; I can share it with you here.

--- IF AGENT DECLINES ---

Step 6: Could you please transfer me to a supervisor or open a case for review?
Step 7: What's the formal submission channel, and can I get a reference number for my records?
```

Source: `seed_claims_demo.py:1113–1130`. Demo row: `seed_claims_demo.py:236–248` (Anker A2068 charger, original $34.99 → current $15.99 → save $18.99).

#### B. IN_STORE_GUIDE — Target / KitchenAid Stand Mixer

```markdown
## In-Store Price Match Guide

**What to Say**
Hi, I'd like to request a Target price match for an item I bought recently — order demo-ord-{10-char-id} — that's now listed at a lower price.

**What to Bring**
- A printed or digital copy of your order confirmation (Order #: demo-ord-{10-char-id})
- A screenshot of the current lower price ($79.99)

**Talking Points**
1. The item was purchased recently — within the published price match window.
2. I paid $99.99 originally; the current price is $79.99.
3. Per Target's Price Match Guarantee, the difference should be refunded to my original payment method.

**Policy Reference**
Target Price Match Guarantee — applies to identical items priced lower at Target within the post-purchase window, refunded to the original tender.

**If Your Claim Is Denied**
Politely ask for a manager and reference the published price match policy.
```

Source: `seed_claims_demo.py:1131–1156`. Five sections (storyboard says four — note this discrepancy: the real fixture has **What to Say**, **What to Bring**, **Talking Points**, **Policy Reference**, AND **If Your Claim Is Denied**). Demo row: `seed_claims_demo.py:250–262` (KitchenAid Artisan stand mixer, original $99.99 → current $79.99 → save $20.00).

#### C. SELF_SERVICE_WALKTHROUGH — Southwest LAX → MIA

```json
{
  "platform_display_name": "Southwest",
  "order_summary": "Southwest Lax → Mia Flight | Paid 500.00 → Now 372.00 | Save 128.00 USD",
  "steps": [
    "Go to Southwest's self-service portal and locate the order management page",
    "Enter your Confirmation #: demo-ord-{10-char-id} and your name as it appears on the booking",
    "Open the \"Request a price adjustment\" or equivalent form",
    "Select Southwest Lax → Mia Flight from the order item list",
    "Submit the price difference ($128.00) request — no further action needed after this step",
    "You'll receive the credit within 1-2 business days"
  ],
  "notes": [
    "Eligible only on identical items / itineraries; modifications may void the guarantee.",
    "Credit posts as a refund to the original payment method or as loyalty credit, depending on Southwest's policy.",
    "Must be completed within the published window for fastest processing."
  ],
  "sub_pattern": "portal_request",
  "estimated_minutes": 3,
  "claim_url": "https://southwest.example.com/self-service",
  "credit_type": "refund to original payment method"
}
```

Source: `seed_claims_demo.py:1157–1191`. Demo row: `seed_claims_demo.py:264–276`. Note title-cased `"Lax → Mia"` (not `"LAX → MIA"`) — this is from the seed's product-title formatting.

#### D. EMAIL — Best Buy / Sony WH-1000XM5

```
Hello Best Buy Customer Care,

I'm writing to request a price match refund on a recent purchase.

Order demo-ord-{10-char-id} — Sony WH-1000XM5 Headphones at $399.99. The current price is $349.99, a difference of $50.00 within the published price match window.

Could you please refund the $50.00 difference to my original payment method? I have the order confirmation and a screenshot of the current price ready to share if you need them.

Thank you,
[Your name]
```

Source: `seed_claims_demo.py:1101–1112`. Demo row: `seed_claims_demo.py:222–234` (Sony WH-1000XM5, original $399.99 → current $349.99 → save $50.00).

**Important deviation from current demo video**: the production demo's 6.5 three-pane is built around the AirPods Pro $199→$149 storyboard, NOT this Sony WH-1000XM5 case. The seed script's email is generic ("Hello Best Buy Customer Care") and does NOT match the SCRIPT.md §6.5 wording. The AirPods email content currently shown in the Remotion 6.5 video is custom-written for the demo, not pulled from the seed.

---

## Per-capability recommendation summary

| Capability | Verdict | Pattern to use | Watch-out |
|---|---|---|---|
| Localized DOF | ✅ | Existing `<RackFocus>` wrapper, applied INSIDE the ResizablePanel | Keep filter at outer wrapper only; don't nest `filter:` inside a bloomed subtree |
| Push-in 1.00→1.03 | ✅ | `transform: scale()` on a dedicated wrapper with `.toFixed(5)` | Don't mix scale with translate on the same element; that's the Breathe trap |
| Stage continuity | ✅ | Two scenes as absolute-inset siblings inside a fixed-size relative parent; cross-fade via opacity | Mount BOTH at frame 0 (`opacity:0` for the dormant one) so `react-resizable-panels` doesn't re-measure mid-fade |

---

## Audit changelog
- v1 — 2026-06-01 — Initial. Capability tests + 4-area UIUX truth extraction.
