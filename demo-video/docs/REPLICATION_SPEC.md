# ClaimIt UI Replication Spec (pixel-faithful Remotion reference)

> Source of truth: `apps/web/src/**`, `apps/web/src/app/globals.css`, `scripts/seed_claims_demo.py`, `seed/policies/best_buy.json`.
> Generated for Remotion compositions reusing `ClaimDetailShell` / panes from `apps/web`.

---

## A. Design tokens

### A.1 Font

| Token | Value | File |
|-------|-------|------|
| `--font-sans` | **Inter** (Google Font, `subsets: ["latin"]`, `display: "swap"`) | `apps/web/src/app/layout.tsx` |
| `--font-heading` | Same as `--font-sans` | `globals.css` L12 |
| `--font-mono` | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | `globals.css` L11 |
| Body | `font-sans antialiased` + `font-feature-settings: "cv11", "ss01", "ss03", "cv02"` | `layout.tsx`, `globals.css` L419–421 |

**Typography scale (in-product, not a separate token file):**

| Use | Classes | Computed |
|-----|---------|----------|
| Landing H1 | `text-5xl sm:text-6xl lg:text-7xl font-semibold leading-[0.95] tracking-tighter` | 48→60→72px, **letter-spacing: tighter** (~−0.05em) |
| Landing sub | `text-lg sm:text-xl leading-relaxed` | 18→20px |
| Section H2 | `text-3xl sm:text-4xl font-semibold tracking-tight` | 30→36px |
| Claim pane title | `font-medium text-neutral-900 text-sm` | 14px / 500 |
| Claim header product | `truncate font-medium text-neutral-900 text-sm` | 14px |
| Evidence current price | `font-semibold text-2xl text-neutral-900 tabular-nums` | 24px |
| Evidence diff | `font-semibold text-lg text-semantic-warning tabular-nums` | 18px |
| Dashboard card title | `text-[15px] font-semibold leading-snug tracking-tight` | 15px |
| Badge base | `text-xs font-medium px-2.5 py-0.5 rounded-full min-w-[6.5rem] text-center` | `lib/badge-styles.ts` |

### A.2 Radius & spacing

| Token | Light value | Derived utilities |
|-------|-------------|-------------------|
| `--radius` | **`0.625rem` (10px)** | `radius-sm` = ×0.6, `md` = ×0.8, `lg` = 10px, `xl` = ×1.4, `2xl` = ×1.8 |
| Card | `rounded-xl` (12px via shadcn card) + `ring-1 ring-foreground/10` | `components/ui/card.tsx` — **no box-shadow** on cards |
| Dialog | shadcn popup — shadow from `@import "shadcn/tailwind.css"` | no custom shadow tokens in repo |
| Pane header | `px-4 py-3` | evidence/draft/assistant |
| Pane body padding | `p-4`, cards `space-y-4` | evidence-pane |
| Dashboard card | `p-6`, `rounded-2xl` on link wrapper | dashboard cards |

**Tailwind spacing used repeatedly:** `gap-2` (8px), `gap-3` (12px), `gap-4` (16px), `px-4 lg:px-6` (claim header/banner).

### A.3 shadcn semantic colors (`:root` / `.dark`)

| Variable | Light | Dark |
|----------|-------|------|
| `--background` | `oklch(1 0 0)` ≈ `#FFFFFF` | `oklch(0.145 0 0)` ≈ `#0A0A0A` |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` |
| `--card-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` |
| `--primary` | `oklch(0.205 0 0)` (near black) | `oklch(0.922 0 0)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |

### A.4 ClaimIt brand & semantic palette (HSL — **use these for claim UI**)

**Light (`:root`):**

| Token | HSL | HEX (approx) | Role |
|-------|-----|--------------|------|
| `--brand-primary-500` | `hsl(217, 50%, 30%)` | `#27466E` | Navy primary — buttons, links, FAB |
| `--brand-primary-50` | `hsl(217, 33%, 97%)` | `#F5F7FA` | Badge bg (Awaiting Approval header) |
| `--brand-primary-600` | `hsl(217, 60%, 22%)` | `#1C3555` | Button hover |
| `--brand-primary-700` | `hsl(217, 70%, 17%)` | `#142840` | Markdown links |
| `--brand-accent-500` | `hsl(142, 65%, 32%)` | `#1D7A3A` | **RECLAIMED MONEY ONLY** |
| `--brand-accent-50` | `hsl(142, 50%, 95%)` | `#EFF8F2` | Success bg tint |
| `--neutral-0` | `hsl(0, 0%, 100%)` | `#FFFFFF` | Surfaces |
| `--neutral-50` | `hsl(220, 20%, 98%)` | `#F9FAFB` | Email To/Subject box, placeholders |
| `--neutral-100` | `hsl(220, 18%, 95%)` | `#F0F2F5` | Assistant bubble, tabs active |
| `--neutral-200` | `hsl(220, 15%, 90%)` | `#E2E6EB` | Borders |
| `--neutral-500` | `hsl(220, 10%, 45%)` | `#6B7280` | Muted labels |
| `--neutral-700` | `hsl(220, 15%, 22%)` | `#303845` | Body secondary |
| `--neutral-900` | `hsl(220, 22%, 8%)` | `#101318` | Headings |
| `--semantic-success` | **`var(--brand-accent-500)`** | `#1D7A3A` | Reclaimed $, Save chip, Resolved header |
| `--semantic-success-bg` | `var(--brand-accent-50)` | `#EFF8F2` | |
| `--semantic-warning` | **`hsl(35, 90%, 50%)`** | `#F59E0B` | Price drop, queued, window countdown |
| `--semantic-warning-bg` | **`hsl(35, 100%, 96%)`** | `#FFFBEB` | Policy quote border area |
| `--semantic-danger` | `hsl(0, 70%, 50%)` | `#D92626` | Denied, Cancel claim text |
| `--semantic-info` | `hsl(210, 90%, 55%)` | `#2B8FE6` | Auto-send "Sent ✓" banner |
| `--semantic-info-bg` | `hsl(210, 100%, 97%)` | `#F0F8FF` | |

**Dark (`.dark`):** neutrals inverted; `--brand-primary-500` lifted to `hsl(217, 75%, 68%)`; `--semantic-warning` → `hsl(35, 80%, 65%)`; money green → `hsl(142, 65%, 65%)`.

**Money vs pending (critical):**

- **Money / reclaimed / Save chip:** `--semantic-success` → `--brand-accent-500` (forest green). Also Tailwind `green-100`/`green-700` on **claims list** outcome badge only.
- **Price drop / pending action / queued:** `--semantic-warning` (amber-orange). **Never** use brand-accent for "drop detected."
- **Auto-send queued header badge:** `bg-semantic-warning/10 text-semantic-warning` (NOT blue).

### A.5 Status pills — exact classes

#### Claim detail header (`claim-header.tsx` → `StatusBadge`)

| Workflow status | Label | Classes | Icon |
|-----------------|-------|---------|------|
| `awaiting_approval` | Awaiting Approval | `bg-brand-primary-50 text-brand-primary-500 border-brand-primary-500/20` | none |
| `queued_for_send` | Queued | `bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20` | none |
| `submitted` | Submitted | `bg-neutral-100 text-neutral-700 border-neutral-200` | none |
| `approved` | Resolved | `bg-semantic-success/10 text-semantic-success border-semantic-success/20` | none |
| `denied` | Resolved | `bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20` | none |
| `expired` | Window Closed | `bg-neutral-100 text-neutral-500 border-neutral-200` | none |
| `cancelled` | Cancelled | `bg-neutral-100 text-neutral-500 border-neutral-200` | none |

Plus inline: `Clock h-4 w-4 text-semantic-warning` + `formatClaimRemainingTime()` when `window_remaining_hours > 0`.

#### Claims list (`claim-outcome-badge.tsx`)

| Outcome | Label | Classes |
|---------|-------|---------|
| `draft_pending` / `awaiting_approval` | Draft pending / Awaiting Approval | `bg-amber-100 text-amber-700 border-amber-200` |
| `queued_for_send` | Sending Soon | `bg-blue-100 text-blue-700 border-blue-200` |
| `pending` | Submitted | `bg-blue-100 text-blue-700 border-blue-200` |
| `approved` | Approved | `bg-green-100 text-green-700 border-green-200` |
| `denied` | Denied | `bg-semantic-danger text-white border-transparent` |
| `expired` / cancelled variants | Expired / Cancelled / … | `bg-neutral-100 text-neutral-600 border-neutral-200` |

#### Purchases list (`purchase-status.ts` → `getListStatusBadge`)

| Backend status | Label | Classes |
|----------------|-------|---------|
| `monitoring` / `monitoring_degraded` | Monitoring | `bg-blue-100 text-blue-700 border-blue-200` |
| `pending_confirmation` | Pending confirmation | `bg-amber-100 text-amber-700 border-amber-200` |
| `pending_user_edit` | Pending edit | `bg-amber-100 text-amber-700 border-amber-200` |
| `claimed` | Claim active | `bg-blue-100 text-blue-700 border-blue-200` |
| `refunded` | Refund received | `bg-green-100 text-green-700 border-green-200` |
| `expired` / `dismissed` | Window expired / Stopped | `bg-neutral-100 text-neutral-600 border-neutral-200` |

#### Dashboard "Needs your attention" chips

| Chip | Label | Classes | Icon |
|------|-------|---------|------|
| Review draft | Review needed | `bg-brand-primary-100 text-brand-primary-700` + `rounded-full px-2.5 py-1 text-xs font-medium` | `FileEdit size-3.5` |
| Confirm extraction | Confirm details | `bg-amber-100 text-amber-700` | `CheckCircle2 size-3.5` |
| Awaiting outcome | Needs your update | `bg-orange-100 text-orange-700` | `Clock size-3.5` |

#### Assistant pane badge

`bg-brand-primary-50 text-brand-primary-500 text-xs` — text: **`🎯 Claim-focused`**

---

## B. Draft pane — four types

Parsers: `apps/web/src/components/claims/draft-parsers.ts`
Renderers: `apps/web/src/components/claims/draft-pane.tsx`

### B.1 Shared chrome

```
PaneHeader: border-b px-4 py-3, icon h-4 text-neutral-500, title font-medium text-sm
Version row: border-b px-4 py-2 — trigger "v{n} of {total} · {source} · {when}" h-8 text-sm
Tabs: Preview | Edit (Edit disabled off-latest with tooltip "Switch to the latest version to edit.")
Redraft overlay: absolute inset-0 z-10 bg-neutral-0/80 backdrop-blur-[1px]
  Loader2 h-8 w-8 animate-spin text-neutral-600
  "Regenerating draft…" font-medium text-sm text-neutral-700
Timeout alert: AlertTitle "Taking longer than expected" / AlertDescription "Refresh to check for an updated draft."
```

Pane titles by type: `Email Draft` | `Chat Script` | `In-Store Guide` | `Self-Service Walkthrough`

### B.2 Email (`claim_type: "email"`)

**Wire format:** plain body string only (no Subject line persisted).
**Subject (display):** `deriveEmailSubject(orderId)` → `Price match refund — Order {orderId}` or `Price match refund request` if empty.

**DOM:**
```html
<div class="space-y-4 p-4">
  <div class="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
    [To: policy.claim_email if non-empty]
    Subject: {derived subject}
  </div>
  <div class="rounded-lg border border-neutral-200 bg-neutral-0 p-4">
    <div class="whitespace-pre-wrap text-neutral-700 text-sm leading-relaxed">{body}</div>
  </div>
</div>
```

### B.3 Chat script (`claim_type: "chat_script"`)

**Wire format:**
```
{title line — optional}

Step 1: {text}
Step 2: {text}
...
--- IF AGENT DECLINES ---

Step 6: {escalation}
Step 7: {escalation}
```

**Test fixture (Best Buy):** see `draft-parsers.test.ts` `CHAT_SCRIPT_HAPPY`.

**DOM:**
- Title: `h4 font-medium text-sm text-neutral-900`
- Steps: `ol space-y-2` → each `li rounded-lg border p-3 pr-12` with `Step {n}` label `text-xs text-neutral-500`
- Collapse trigger: `"If the agent declines or stalls"` — `text-xs text-neutral-500`, ChevronRight rotates 90° when open
- Copy button on hover: ghost icon top-right

### B.4 In-store guide (`claim_type: "in_store_guide"`)

**Wire format:**
```
## In-Store Price Match Guide

**What to Say**
{paragraph}

**What to Bring**
- bullet

**Talking Points**
1. numbered

**Policy Reference**
{text}

**If Your Claim Is Denied**
{text or URL}
```

Section keys (positional): `what_to_say`, `what_to_bring`, `talking_points`, `policy_reference`, `if_denied`.

**DOM:** `space-y-3 p-4` → title + per-section `rounded-lg border p-4 space-y-2` with heading `font-medium text-sm`. Footer optional: `Call ahead: {phone}`, `Policy: {link}` in `bg-neutral-50 text-xs`.

### B.5 Self-service (`claim_type: "self_service_walkthrough"`)

**Wire format:** JSON with 8 required fields:
```json
{
  "platform_display_name": "string",
  "order_summary": "{product} | Paid {p1} → Now {p2} | Save {amt} {currency}",
  "steps": ["string", ...],
  "notes": ["string", ...],
  "sub_pattern": "direct_rebook|cancel_rebook|form_submit|portal_request",
  "estimated_minutes": 3,
  "claim_url": "https://...",
  "credit_type": "refund to original payment method"
}
```

**Price chips (`PriceCallout`):**
| Chip | Classes |
|------|---------|
| Paid / Now | `border-neutral-200 bg-neutral-50 text-neutral-700`, label `uppercase tracking-wide text-neutral-500 text-xs`, value `font-medium text-sm` |
| Save | `border-semantic-success/30 bg-semantic-success/5 text-semantic-success` |

**DOM sections:** platform row + `~{n} min` outline badge → product line → chips → optional cancel_rebook warning → Steps `ol list-decimal` → Notes `ul list-disc bg-neutral-50` → `Open {platform}` button + `Refund issued as {credit_type}` text-xs.

### B.6 Header action matrix (`claim_type` × `status` × Gmail)

**Always (in_store only, any status):** `Download PDF` (outline sm, Printer icon) → `window.print()`.

| status | email + Gmail ✓ | email + Gmail ✗ | chat_script | in_store_guide | self_service |
|--------|-----------------|-----------------|-------------|----------------|--------------|
| `awaiting_approval` | Edit draft*, Cancel claim, **Approve and send** | Edit draft*, Cancel, **Approve** | Cancel, **Approve** | Cancel, **Approve** | Cancel, **Approve** |
| `queued_for_send` | `Sending in {M:SS}`, Cancel, **Send now** | same | same | same | same |
| `submitted` | **Approved / refunded**, **Denied** | same | same | same | same |
| `approved` | Reclaimed ${amount}, View receipt (disabled tooltip) | same | same | same | same |
| `denied` | denial text + **Try a different angle** (or Regenerating…) | same | same | same | same |
| `cancelled` / `expired` | cancel reason text / none | same | same | same | same |

\*Edit draft: **email only**, `awaiting_approval` only.

**Approve dialog labels** (`getApproveAction`): queued → "Send now"; email+Gmail → "Approve and send" / dialog "Send claim email"; email no Gmail → "Approve"; other types → "Approve" + type-specific dialog title.

---

## C. Evidence & Assistant panes

### C.1 Evidence (`evidence-pane.tsx`)

**Field sources** (`claim-detail-view.ts` → `buildEvidence`):

| UI field | Source |
|----------|--------|
| `original_price` | `purchase.price_paid` |
| `current_price` | `max(0, price_paid - claim.claim_amount)` |
| `difference` | `original - current` (display `-{formatClaimCurrency(diff)}`) |
| Screenshot | `GET /claims/:id/evidence` blob; alt `{platform} price-drop screenshot` |
| `captured_at` | `evidence_captured_at` from price_history join |
| `source_url` | `purchase.product_url` |
| `policy_clause` | `claim.policy_clause_cited` ?? `policy.policy_text_relevant_clause` |
| Policy link | `Read {platform} policy` → `policy.policy_url` (sanitized) |
| Policy verified | `Policy verified {formatDateShort(policy.last_verified)}` |
| Purchase date / order / price | `purchase.*` |
| Receipt placeholder | dashed box 80px — **not wired to real receipt on claim page** |

**Current price card styling:**
- Title row: `TrendingDown h-4 text-semantic-warning` + "Current price"
- Original: `text-neutral-500 text-sm tabular-nums`
- Current: `font-semibold text-2xl text-neutral-900 tabular-nums`
- Diff: `font-semibold text-lg text-semantic-warning` + label "difference" `text-xs text-neutral-500`
- Policy quote: `border-l-4 border-semantic-warning bg-semantic-warning-bg/30 px-3 py-2 text-sm italic`

### C.2 Assistant (`assistant-pane.tsx`)

**Quick-action pills (exact strings):**
1. `Make it friendlier`
2. `Why this template?`
3. `Explain the policy match`
4. `Switch to manual approval`

**Pill classes:** `rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1 text-neutral-700 text-xs hover:bg-neutral-100`

**Message bubbles:**
| Role | Container | Content |
|------|-----------|---------|
| Assistant | `max-w-[85%] rounded-lg px-4 py-2.5 bg-neutral-100` | Bot avatar `h-8 w-8 rounded-full bg-neutral-100` |
| User | `max-w-[85%] rounded-lg px-4 py-2.5 bg-brand-primary-500 text-neutral-0 ml-auto` | User avatar `bg-brand-primary-500` |

**Tool line (completed):** `Badge secondary mt-2 text-neutral-500 text-xs` → **`Tools · {tool1, tool2}`**
**Running tool:** `Running {toolName}…`
**View trace:** `text-neutral-400 text-xs hover:text-brand-primary-500` + ExternalLink — URL pattern:
`https://app.phoenix.arize.com/s/claimitbeta/projects/UHJvamVjdDoz/spans/{trace_id}`

**Streaming:** `MarkdownMessage` with `animate={streaming}` — reveals `max(2, ceil((target-current)/40))` chars every **16ms** (~60fps); no blinking cursor in production assistant pane (Loader2 spinner while streaming).

**Empty state:** `Ask about this claim — try a quick action below or type your own question.`

**Input:** placeholder `Ask about this claim...`, Send icon button.

---

## D. Dynamic states (code truth)

### D.1 Auto-send (`queued_for_send`)

| Item | Value |
|------|-------|
| **Delay default** | `auto_send_delay_seconds: 300` (5 min) — `auth middleware`, onboarding fallback |
| **Seed demo row** | Hilton queued claim uses **`now + 20 minutes`** (not 5 min) for recording safety |
| **Header countdown** | `formatCountdown`: `{minutes}:{seconds}` zero-padded seconds, floor at `0:00` |
| **Header copy** | `<Clock />` + **`Sending in {countdown}`** (note: NOT "Sending in M:SS" literally — e.g. `Sending in 4:32`) |
| **Banner row (queued)** | `border-semantic-warning/30 bg-semantic-warning-bg text-semantic-warning`, `rounded-md px-4 py-3 text-sm` |
| **Banner text** | `Sending {platformLabel} claim in **{countdown}**` (countdown semibold tabular-nums) |
| **Banner actions** | Link **Review** → `/claims/{id}` · Button **Send now** (brand primary) · ghost **X** Cancel → `window.confirm("Cancel {platform} claim?")` |
| **Banner sent state** | `border-semantic-info/20 bg-semantic-info/10 text-semantic-info` — **`Sent {platform} claim`** + Check icon; auto-dismiss 3000ms |
| **Overflow** | `+{n} more sending` text-xs text-neutral-500 (max 3 visible rows) |

### D.2 Redraft

| Item | Value |
|------|-------|
| Timeout | **`REDRAFT_TIMEOUT_MS = 45_000`** (`store/claim-redraft-progress.ts`) |
| Overlay | see B.1 |
| Timeout toast | `"Couldn't redraft. Please try again."` |
| Success toast | `"Draft updated"` |

### D.3 Post-approve banner (`status === "submitted"`)

Shell: `border-b bg-brand-primary-50 px-4 py-2 text-brand-primary-500 text-sm`

| claim_type | Copy (exact) |
|------------|--------------|
| **email** + Gmail | **`Submitted`** — sending from your Gmail. |
| **email** no Gmail | **`Submitted`** — copy the email draft above and send it manually. |
| **chat_script** | **`Submitted.`** Use the per-step Copy buttons on the script to paste one message at a time. [+ Open {platform} chat if claim_url safe] |
| **in_store_guide** | **`Submitted.`** Show this guide at the store[ — call {phone} first if you want to confirm.] |
| **self_service** | **`Submitted.`** ~{estimated_minutes} min to complete at {platform_display_name}. [+ Open button] |
| **self_service parse fail** | **`Submitted.`** Follow the walkthrough steps to complete the request yourself. |

### D.4 Confirm loader (`confirm-purchase-loader.tsx`)

| State | UI |
|-------|-----|
| `loading` | `ReceiptCardSkeleton` |
| `analyzing` | Skeleton aspect 4/3 + **"Analyzing your receipt…"** (`text-lg font-semibold`) + *"We're reading the purchase details. This usually takes a few seconds."* |
| `analyzing_timeout` | **"Still analyzing your receipt"** + *"This is taking longer than usual. Refresh in a moment to pick up where we left off."* + **Refresh** button |
| `selecting` | `MultiItemSelection` (multi-line receipt) |
| `ready` | `ConfirmPurchaseContent` + action bar **Confirm and start monitoring** |
| `error` | Alert **"Couldn't load this receipt"** + message + Try again |
| Success redirect | `router.push(/purchases/{id})` |

Poll: `POLL_INTERVAL_MS = 1500`, cap `POLL_CAP_MS = 45000`.

### D.5 Upload dialog

| State | Copy |
|-------|------|
| Title | Upload a receipt |
| Description | ClaimIt extracts the purchase details and starts monitoring the eligible window. **PDF, PNG, or JPG up to 10 MB.** |
| Idle dropzone | **Drag a receipt here** / **Drop your receipt here** (drag active) |
| Uploading | Progress bar + **`Uploading & reading your receipt…`** (Loader2 spin) |
| Footer CTA | idle: **Upload receipt** / uploading: **Uploading…** |
| Success | toast **"Receipt uploaded."** → close → **`/confirm/{stagingKey}?from=/dashboard`** |

Progress fake: starts 8%, creeps toward 90% every 250ms with `min(90, p + max(1, (90-p)*0.08))`, snap 100% on success.

---

## E. Motion & timing

### E.1 globals.css keyframes

| Name | Duration | Easing | Effect |
|------|----------|--------|--------|
| `marquee-left/right` | 90s | linear | logo wall |
| `shimmer` | 1.5s | linear | skeleton |
| `breathe` | 2.8s | ease-in-out | scale 1→1.04 |
| `ring-pulse` | 2.5s | cubic-bezier(0.16, 1, 0.3, 1) | FAB proactive ring scale 1→1.8, opacity 0.4→0 |
| `pulse-dot` | 1.4s | ease-in-out | opacity 0.3↔1 |
| `animate-ping` (Tailwind) | default | — | floating assistant proactive ring |

### E.2 Landing / mock (`claim-detail-demo.tsx`)

| Effect | Timing |
|--------|--------|
| Section fade-up | `duration: 0.6`, `ease: "easeOut"`, `y: 20→0` |
| Hero H1 | `leading-[0.95] tracking-tighter`, fadeUp delays 0 / 0.1 / 0.2s |
| Header buttons stagger | `duration: 0.4`, ease `[0.16, 1, 0.3, 1]` |
| Evidence **$50 count-up** | **1000ms**, ease **`1 - (1-t)³`** (ease-out cubic) |
| Draft typewriter | **8ms/char** (`bodyTypeMs`) |
| Assistant typewriter | **18ms/char** |
| Phase switch draft→assistant | **5000ms** (`switchToAssistantAt`) |
| Assistant part1→indicator | **200ms** delay after part1 done |
| indicator→part2 | **600ms** |
| Watch again delay | **2800ms** |
| Approve glow | **2500ms** after `done-auto` |
| Assistant highlight border | **700ms** |
| Live dot ping | `animate-ping` on `bg-semantic-success` badge |

### E.3 Social proof (`social-proof-section.tsx`)

- **"4 Types"** / **"3 Categories"**: static text (no count-up)
- **Reclaimed This Month**: **`animate(motionValue, 342, { duration: 1.5, ease: "easeOut" })`** — displays `$342` (not $93→$341; user-reported example qualifier below stat)

### E.4 Production assistant stream

- `MarkdownMessage`: **16ms** interval, chunk step `max(2, ceil((target-current)/40))`

### E.5 Hover transitions (common)

- Dashboard cards: `transition-[border-color,box-shadow] duration-200`
- CTA buttons: `transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`
- Logo wall: `transition-opacity duration-300`

---

## F. Best Buy seed & demo data

### F.1 Important discrepancies

1. **Policy DB** (`seed/policies/best_buy.json`): `claim_type: "chat_script"`, `claim_email: null`.
2. **Demo seed Sony claim** (`seed_claims_demo.py` SPECS[0]): forced **`ClaimType.EMAIL`** for UI variety — pending group shows all 4 renderers across platforms.
3. **Claim UUIDs** are **`uuid4()` at seed time** — there is **no fixed `467f2b31…` in repo**. After `./scripts/qa_reset.sh`, read live ID via `/claims` list or Mongo `{product_name: /Sony WH-1000XM5/, _seed: "5_4_demo"}`.
4. **`demo-video/remotion/src/data/claim.ts`** uses **AirPods $199→$149** storyboard mock — **not** seed Sony data.
5. **`claim-detail-demo.tsx`** (landing) uses Sony + **hardcoded** demo strings — separate from production shell.

### F.2 Best Buy policy (seed JSON)

```json
{
  "platform": "best_buy",
  "window_days": 15,
  "window_days_member": 60,
  "claim_type": "chat_script",
  "claim_url": "https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c",
  "claim_email": null,
  "policy_url": "https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c",
  "policy_text_relevant_clause": "If an identical product drops in price at Best Buy within the customer's return window (15 days standard, 60 days for Plus/Total members), Best Buy will refund the difference to the original tender.",
  "last_verified": "2026-05-14"
}
```

Seeded `policy_clause_cited` on claims (shorter):
> Best Buy Price Match Guarantee: we will match a lower price on an identical item sold by Best Buy within the post-purchase window.

### F.3 Sony WH-1000XM5 claim (seed spec — deterministic fields)

| Field | Value |
|-------|-------|
| `outcome` | `draft_pending` → UI `awaiting_approval` |
| `platform` | `best_buy` → **Best Buy** |
| `product_name` | Sony WH-1000XM5 Headphones |
| `price_paid` | **399.99** |
| `claim_amount` | **50.00** |
| `current_price` (derived) | **349.99** |
| `claim_type` (seed) | **email** |
| `currency` | USD |
| `window_offset_days` | +11 from seed `now` |
| `product_url` | `https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p` |
| `order_id` pattern | `demo-ord-{purchase_uuid_hex[:10]}` |
| `trace_id` | **null** in seed |
| `draft_versions[0].generated_by` | `agent` |

**Exact email `draft_content` template** (`_build_draft_content_for_pending`):

```
Hello Best Buy Customer Care,

I'm writing to request a price match refund on a recent purchase.

Order {order_id} — Sony WH-1000XM5 Headphones at $399.99. The current price is $349.99, a difference of $50.00 within the published price match window.

Could you please refund the $50.00 difference to my original payment method? I have the order confirmation and a screenshot of the current price ready to share if you need them.

Thank you,
[Your name]

```

**Display subject:** `Price match refund — Order {order_id}`

**Evidence VM (from builder):**
```json
{
  "original_price": 399.99,
  "current_price": 349.99,
  "policy_clause": "<policy_clause_cited above>",
  "source_url": "https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p",
  "captured_at": "<from price_history snapshot when evidence uploaded>",
  "screenshot_url": "<gs://... when EVIDENCE_BUCKET set>"
}
```

### F.4 Best Buy pending confirm row (seed — NOT MacBook)

Label: **`low-price-only`**

| Field | Value |
|-------|-------|
| `product_name` | Sony WH-1000XM5 Wireless Headphones |
| `price_paid` | 399.99 |
| `order_id` | **BBY01-806748902-1234** |
| `platform` | best_buy |
| `status` | pending_confirmation |
| `ingestion_source` | upload_image |
| `fixture` | sample-receipt.jpg |
| Low confidence | `price_paid` / `price` @ **0.82** → banner names price field |

Dashboard chip: **Confirm details** · link `/confirm/{purchaseId}?from=/dashboard`

### F.5 MacBook Neo (S4 live fixture — NOT in Mongo seed)

From `scripts/fixtures/bestbuy_receipt_README.md` + `make_receipt.py`:

| Field | Value |
|-------|-------|
| Product | 13" MacBook Neo A18 Pro · 512GB · Silver |
| SKU | 6615875 |
| **Paid** | **$899.00** |
| Total w/ tax | $952.94 |
| Purchase date | 2026-05-22 |
| Member | **Non-member** → 15-day window |
| Store / txn | #1407 Troy MI · **TRANS 152784** |
| Product URL (manual on confirm) | `https://www.bestbuy.com/product/13-inch-macbook-neo-apple-a18-pro-chip-with-6-core-cpu-and-5core-gpu-8gb-memory-512gb-ssd-silver/JJGCQYX92P` |
| Expected drop | ~$899 → ~$699 (~$200) |

Upload file: `scripts/fixtures/bestbuy_macbook_pricedrop_receipt.png`

---

## G. Remotion reuse map

| Component | Path | Used in demo-video |
|-----------|------|-------------------|
| **ClaimDetailShell** | `apps/web/src/components/claims/claim-detail-shell.tsx` | SixFive, SixSix, SixSeven |
| EvidencePane | `evidence-pane.tsx` | validation Stage2 |
| Badge, Button | `components/ui/*` | validation Stage1 |
| **NOT used** | `landing/claim-detail-demo.tsx` | Landing only — animated mock |
| Mock data file | `demo-video/remotion/src/data/claim.ts` | AirPods storyboard (override for Sony seed in film) |

Shims: `demo-video/remotion/src/shims/*` — mock stores, next/navigation, markdown stub.

---

## H. Quick screenshot checklist (Best Buy film)

- [ ] Email draft: To/Subject box + body (Sony seed text)
- [ ] Evidence: $399.99 / $349.99 / -$50.00 warning amber
- [ ] Header: Awaiting Approval navy badge + Edit / Cancel / Approve and send
- [ ] Assistant: 🎯 Claim-focused + 4 pills + tool trace line
- [ ] queued_for_send: header Sending in M:SS + dashboard banner
- [ ] Post-approve Submitted banner (email Gmail vs manual)
- [ ] Upload dialog mid-flight progress copy
- [ ] Confirm analyzing state
- [ ] Dark mode variant (optional): toggle via `.dark` class on root
