# ClaimIt Frontend — Recon for Hand-Built Demo Compositions

Generated 2026-05-31 as the reference document for `demo-video/compositions/06-demo/*.html` builds. Every demo composition that mirrors the product UI reads from this file's tokens + page-component map, **not** from live captures.

If a value here turns out to drift from the real `apps/web/` code, fix this file first, then any downstream composition.

---

## 1. Stack

| Concern | Tech | Evidence |
|---|---|---|
| Framework | **Next.js 16.2.6** (App Router) | `apps/web/package.json` |
| React | **19.2.4** | `apps/web/package.json` |
| Router | App Router with route groups (`(authenticated)`, `(public)`, `(onboarding)`, `(public-auth)`) | `apps/web/src/app/` |
| Language | TypeScript 5, strict, path alias `@/* → ./src/*` | `apps/web/tsconfig.json` |
| Build | Webpack (`next dev --webpack`) | `apps/web/package.json` scripts |
| Linter | Biome (no ESLint) | `pnpm exec biome check .` |
| State | Zustand 5 (multiple stores under `src/store/`) | `apps/web/src/store/` |
| Auth | Firebase client SDK + `AuthInit` provider | `apps/web/src/app/layout.tsx` |
| Themes | `next-themes` (`attribute="class"`, `system` default, supports `.dark`) | `apps/web/src/app/layout.tsx` |

> **Important caveat from `apps/web/AGENTS.md`:** *"This is NOT the Next.js you know."* Pre-release Next 16 has breaking changes vs. training data. **For demo compositions this doesn't matter** — we're producing static HTML/CSS that imitates the rendered look, not Next code.

---

## 2. CSS approach — definitively

**Tailwind CSS v4** (alpha) via the **`@tailwindcss/postcss`** plugin, configured **purely through `globals.css`** — there is no `tailwind.config.js`. Tokens are declared in `:root` and `.dark`, then exposed to Tailwind's utility generator via the `@theme inline { … }` block.

| File | Role |
|---|---|
| `apps/web/src/app/globals.css` | Single source of truth. Imports `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`. Declares all tokens, custom keyframes, print stylesheet, global polish. |
| `apps/web/postcss.config.mjs` | Wires `@tailwindcss/postcss`. Two lines. |
| `apps/web/components.json` | Shadcn config: `style="base-nova"`, `baseColor="zinc"`, `cssVariables: true`, `iconLibrary: "lucide"`. |
| `apps/web/tsconfig.json` | Path alias `"@/*": ["./src/*"]` (heavily used). |

**No CSS Modules, no styled-components, no Emotion, no Stitches, no vanilla-extract.** Everything is Tailwind class strings + a few `@keyframes` blocks in `globals.css`. Conditional classes are composed with `cn()` (`apps/web/src/lib/utils.ts` — `clsx` + `tailwind-merge`).

---

## 3. Design tokens — full extraction

All values from `apps/web/src/app/globals.css`. Light mode (`:root`) shown; dark mode (`.dark`) lifts brand by ~30% and inverts neutrals — irrelevant for the demo film, which renders the light UI.

### 3.1 Brand — Primary (Deep Navy)

> Used for primary buttons, links, focus rings, "Awaiting Approval" badge background, Assistant pane Sparkles icon.

| Token | HSL | Notes |
|---|---|---|
| `--brand-primary-50` | `217 33% 97%` | Badge bg, light hover |
| `--brand-primary-100` | `217 30% 92%` | "Review needed" pill bg |
| `--brand-primary-200` | `217 28% 82%` | |
| `--brand-primary-300` | `217 28% 65%` | |
| `--brand-primary-400` | `217 32% 45%` | |
| `--brand-primary-500` | `217 50% 30%` | **Primary** — button bg, link text, focus ring |
| `--brand-primary-600` | `217 60% 22%` | Primary hover, CTA strong text |
| `--brand-primary-700` | `217 70% 17%` | "Review needed" pill text |
| `--brand-primary-800` | `217 75% 13%` | |
| `--brand-primary-900` | `217 80%  9%` | Deepest |

### 3.2 Brand — Accent (Forest Green) — RECLAIMED MONEY ONLY

> Comment in `globals.css` literally reserves this color for **money won**. Don't use it for general success states (those use `--semantic-success`, which is an alias of `--brand-accent-500` — same color, scoped intent).

| Token | HSL |
|---|---|
| `--brand-accent-50…900` | `142 50% 95%` → `142 85% 9%` (forest) |
| `--brand-accent-500` (semantic-success) | `142 65% 32%` |

### 3.3 Neutral (cool, slightly navy-tinted)

> Slight 220° hue shift (not pure grey) — every neutral has a faint navy lean. Matches the brand's "cool, considered" feel.

| Token | HSL |
|---|---|
| `--neutral-0` | `0 0% 100%` (pure white) |
| `--neutral-50` | `220 20% 98%` |
| `--neutral-100` | `220 18% 95%` |
| `--neutral-200` | `220 15% 90%` (borders, dividers) |
| `--neutral-300` | `220 12% 80%` |
| `--neutral-400` | `220 10% 60%` |
| `--neutral-500` | `220 10% 45%` (secondary text) |
| `--neutral-600` | `220 13% 32%` |
| `--neutral-700` | `220 15% 22%` (body text) |
| `--neutral-800` | `220 18% 14%` |
| `--neutral-900` | `220 22%  8%` (headings) |

### 3.4 Semantic colors

| Token | HSL | Used for |
|---|---|---|
| `--semantic-success` | `--brand-accent-500` | refund won, money green |
| `--semantic-success-bg` | `--brand-accent-50` | success backgrounds |
| `--semantic-warning` | `35 90% 50%` (amber) | "Sending in 2:34", price-drop arrow, policy clause highlight |
| `--semantic-warning-bg` | `35 100% 96%` | policy clause blockquote bg |
| `--semantic-danger` | `0 70% 50%` (red) | Cancel claim, denied |
| `--semantic-danger-bg` | `0 80% 97%` | |
| `--semantic-info` | `210 90% 55%` (blue) | informational |
| `--semantic-info-bg` | `210 100% 97%` | |

### 3.5 Shadcn primitives (`oklch`)

> Shadcn ships its own token layer alongside ClaimIt's. Maps to ClaimIt's brand via the `@theme inline` block: `--color-primary: var(--primary)`, etc. For demo work, the ClaimIt tokens above are the right reference — the shadcn ones are intermediates.

Key ones: `--background: oklch(1 0 0)`, `--foreground: oklch(0.145 0 0)`, `--card: oklch(1 0 0)`, `--border: oklch(0.922 0 0)`, `--primary: oklch(0.205 0 0)`.

### 3.6 Typography

**One typeface: Inter**, loaded by Next via `next/font/google` in `apps/web/src/app/layout.tsx`, exposed as the CSS variable `--font-sans`.

```ts
const inter = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
```

`--font-mono` falls back to system: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`. **No JetBrains Mono in the real product** — the storyboard's preference for JetBrains Mono is a demo-video choice, fine to keep but flag if pixel-fidelity matters.

`--font-heading: var(--font-sans)` — headings reuse Inter.

Body has `font-feature-settings: "cv11", "ss01", "ss03", "cv02"` — Inter stylistic alternates (single-storey `a`, etc.). The demo can ignore this; it's subtle.

### 3.7 Radius scale

`--radius: 0.625rem` (10px) is the base. Multipliers via `@theme inline`:

| Token | Multiplier | Px |
|---|---|---|
| `--radius-sm` | × 0.6 | 6px |
| `--radius-md` | × 0.8 | 8px |
| `--radius-lg` | × 1.0 | 10px (base) |
| `--radius-xl` | × 1.4 | 14px |
| `--radius-2xl` | × 1.8 | 18px |
| `--radius-3xl` | × 2.2 | 22px |
| `--radius-4xl` | × 2.6 | 26px |

Common card radius in real code is `rounded-lg` (10) and `rounded-xl` (14).

### 3.8 Spacing scale

**Default Tailwind v4 spacing scale.** No customization in `globals.css`. So `gap-2 = 0.5rem = 8px`, `gap-3 = 0.75rem = 12px`, `gap-4 = 1rem = 16px`, `gap-6 = 1.5rem = 24px`. Standard.

### 3.9 Shadow scale

**Default Tailwind shadows.** No customization. Real product mostly uses `shadow-sm` on hover (cards) and `shadow` on dialogs/popovers.

### 3.10 Motion durations / easings

No custom motion tokens in CSS, but `tw-animate-css` is imported and `motion@12` (Framer Motion successor) is installed. **Demo film uses GSAP per STORYBOARD.md** — no need to import motion. The product's own custom keyframes in `globals.css`:

| Keyframes | Duration | Use |
|---|---|---|
| `marquee-left/right` | 90s linear infinite | Landing logo walls (irrelevant for demo) |
| `shimmer` | 1.5s linear infinite | skeleton loading |
| `breathe` | 2.8s ease-in-out | FAB |
| `ring-pulse` | 2.5s `cubic-bezier(0.16, 1, 0.3, 1)` | Notification badge |
| `pulse-dot` | 1.4s ease-in-out | Status indicators |

`prefers-reduced-motion` disables all four.

---

## 4. Critical pages — file paths + component trees

### 4.1 `/dashboard`

| Path | Role |
|---|---|
| `apps/web/src/app/(authenticated)/dashboard/page.tsx` | Page root (1022 lines) |
| `apps/web/src/components/dashboard/hero/new-user.tsx` | Empty-state hero |
| `apps/web/src/components/dashboard/hero/active-user.tsx` | Hero for users with active claims |
| `apps/web/src/components/dashboard/hero/reclaim-experienced.tsx` | Hero with lifetime savings |
| `apps/web/src/components/dashboard/auto-send-banner.tsx` | Queued-for-send live countdown banner |

**Top-level structure (active or experienced user):**

1. `<PageHeader>` — h1 "Dashboard" + subtitle + Gmail status badge + "Upload receipt" primary button (+ dev-only DropdownMenu state switcher in dev).
2. `<HeroActiveUser>` / `<HeroReclaimExperienced>` — card with stat counters + CTA.
3. `<AutoSendBanner>` — sticky amber banner when claims are auto-sending soon.
4. `<NeedsAttentionSection>` — section header + 2-col grid of cards (`ReviewDraftCard` / `ConfirmExtractionCard` / `AwaitingOutcomeCard`). Each card has platform logo + status pill + product title + meta + right-chevron CTA.
5. `<MonitoredPurchasesSection>` — `<table>` with columns Platform / Item / Category / Status / Window. Rows are clickable, navigate to `/purchases/[id]`. **No 26-logo grid here** — the storyboard's "26-platform wall" lives in landing pages, not the dashboard itself.
6. Two-column grid: `<QuickUploadSection>` (dashed-border drop zone) + `<RecentActivitySection>` (bulleted activity feed).

**For the storyboard's Section ⑦ Reach wall, the real source for logos is `apps/web/src/components/landing/` (not dashboard).** The dashboard does *not* display all 26 platforms — it's a per-user purchase list. Reach composition will need to either pull from landing components or hard-code the 26-logo list separately.

### 4.2 `/claims/[id]`

| Path | Role |
|---|---|
| `apps/web/src/app/(authenticated)/claims/[id]/page.tsx` | Page (loads `ClaimDetailResponse`, renders skeleton / notFound / error / `ClaimDetailShell`) |
| `apps/web/src/components/claims/claim-detail-shell.tsx` | **3-pane orchestrator**, ~535 lines. Uses `react-resizable-panels`. |
| `apps/web/src/components/claims/claim-header.tsx` | Sticky header bar (status badge, breadcrumb, action buttons) |
| `apps/web/src/components/claims/draft-pane.tsx` | Email Draft pane (1036 lines — has 4 renderers: email / chat / in-store / self-service) |
| `apps/web/src/components/claims/evidence-pane.tsx` | Evidence pane (3 cards) |
| `apps/web/src/components/claims/assistant-pane.tsx` | Assistant pane (Sparkles, message bubbles, quick actions, input) |
| `apps/web/src/components/claims/post-approve-banner.tsx` | Banner after approve |

**Visual structure** (demo target — desktop layout, `lg+`):

```
┌────────────────────────────────────────────────────────────────────────┐
│ Sticky header bar:                                                      │
│   ← Claims / AirPods Pro          [Awaiting Approval]  Best Buy · $50  │
│                                    Clock · 8d remaining                  │
│                                  [Edit draft]  [Cancel]  [Approve →]    │
├────────────────────────┬───────────────────────────────────────────────┤
│ DraftPane (40%)        │ EvidencePane (60% of right column, top 60%)    │
│  Mail · Email Draft    │  FileText · Evidence                          │
│  v1 · AI draft · now   │  [Current price card]                          │
│  Preview │ Edit        │  [Policy card]                                 │
│  ┌──────────────────┐  │  [Original purchase card]                      │
│  │ To: …            │  ├───────────────────────────────────────────────┤
│  │ Subject: …       │  │ AssistantPane (40% of right column)            │
│  ├──────────────────┤  │  Sparkles · Assistant   🎯 Claim-focused       │
│  │ Body…            │  │  "Ask about this claim — try a quick action…" │
│  └──────────────────┘  │  [quick-action pills row]                       │
│                        │  [textarea  ] [Send]                            │
└────────────────────────┴───────────────────────────────────────────────┘
```

Real layout uses `react-resizable-panels` with a horizontal split (40/60), then a vertical split inside the right column (60/40). Pane headers are `<button>` elements with a small `Maximize2` icon that appears on hover.

**Draft pane (email type) anatomy:**
- Pane header: `Mail` icon + "Email Draft"
- Version row: `<VersionDropdown>` "v1 · AI draft · just now" (no "Back to latest" affordance on the only version)
- Tabs: `Preview` / `Edit` (Preview default)
- Body: card with To/Subject metadata block (`neutral-50` bg, padded rows with `w-16 font-medium text-neutral-500` labels), then a second card with the prose body (`whitespace-pre-wrap`, `text-neutral-700 text-sm leading-relaxed`).

**Evidence pane anatomy:**
Three cards, all `border-neutral-200` with the shadcn `<Card>` primitive:
1. **Current price** — `TrendingDown` icon (amber/semantic-warning), header "Current price"; row with Original price (small `neutral-500`) + Current price (`text-2xl font-semibold tabular-nums`); right side `-$50` in `text-semantic-warning`; below it a placeholder for the price-drop screenshot (4:3 ratio); source line + captured-at timestamp underneath.
2. **Policy** — `FileText` icon, header "Best Buy price match policy"; blockquote with `border-l-4 border-semantic-warning bg-semantic-warning-bg/30 px-3 py-2 italic`; "Read Best Buy policy" external link (`text-brand-primary-500`); verified-on date.
3. **Original purchase** — `Receipt` icon, header "Your original purchase"; placeholder receipt thumbnail (dashed border); key/value rows for Purchase date, Order ID (mono), Price paid; "View purchase →" link.

**Assistant pane anatomy:**
- Pane header: `Sparkles` icon (`text-brand-primary-500`) + "Assistant" + right-aligned `Badge` "🎯 Claim-focused" (`bg-brand-primary-50 text-brand-primary-500`)
- Empty state: `p` with `text-sm text-neutral-500`: "Ask about this claim — try a quick action below or type your own question."
- Quick-action pill row (`<button>` pills, `rounded-full border-neutral-200`): `"Make it friendlier"`, `"Why this template?"`, `"Explain the policy match"`, `"Switch to manual approval"`
- Input row: `<Textarea>` placeholder `"Ask about this claim..."` + `<Button size="icon">` with `Send` icon

### 4.3 `/confirm/[purchaseId]`

| Path | Role |
|---|---|
| `apps/web/src/app/(authenticated)/confirm/[purchaseId]/page.tsx` | Thin shell (Suspense → loader) |
| `apps/web/src/components/confirm/confirm-purchase-loader.tsx` | Fetch + state machine |
| `apps/web/src/components/confirm/confirm-purchase-content.tsx` | Main layout |
| `apps/web/src/components/confirm/extraction-review-form.tsx` | Right-column extracted fields w/ green checkmarks |
| `apps/web/src/components/confirm/receipt-preview.tsx` | Left-column receipt image |
| `apps/web/src/components/confirm/confidence-banner.tsx` | "AI is unsure about X" amber banner |
| `apps/web/src/components/confirm/action-bar.tsx` | Sticky footer "Confirm and Monitor" / "Cancel" |

Structure: two-column layout, receipt preview left, extracted fields right (each with `CheckCircle2` confidence pill), sticky footer action bar.

### 4.4 `/purchases/[id]`

| Path | Role |
|---|---|
| `apps/web/src/app/(authenticated)/purchases/[id]/page.tsx` | Page root (loads view-model) |
| `apps/web/src/components/purchase/purchase-detail-content.tsx` | Main layout |
| `apps/web/src/components/purchase/purchase-page-header.tsx` | Header with breadcrumb + status |
| `apps/web/src/components/purchase/price-history-chart.tsx` | **Recharts** line chart — `recharts@3.8.1` |
| `apps/web/src/components/purchase/refund-eligibility-card.tsx` | Right-sidebar card "Eligible for $50 refund" |
| `apps/web/src/components/purchase/related-claims-card.tsx` | List of claims linked to this purchase |
| `apps/web/src/components/purchase/original-purchase-details.tsx` | Read-only product details panel |

**The price chart is `recharts`** — composition will need to either embed a Recharts SVG manually or hand-build an equivalent SVG (the storyboard's "flat line then sharp drop" is easy to hand-build).

---

## 5. Reusable UI primitives (Shadcn — `apps/web/src/components/ui/`)

Backed by **`@base-ui/react`** (Radix-style headless primitives) for `Button`, `Dialog`, `DropdownMenu`, `Popover`, `Tabs`, `Tooltip`, `Switch`, etc. Variants via **`class-variance-authority`** + `cn()`.

Full inventory:

```
accordion.tsx       calendar.tsx        dialog.tsx          progress.tsx    skeleton.tsx
alert.tsx           card.tsx            dropdown-menu.tsx   radio-group.tsx sonner.tsx
avatar.tsx          collapsible.tsx     input.tsx           resizable.tsx   switch.tsx
badge.tsx           label.tsx           platform-logo.tsx   scroll-area.tsx table.tsx
button.tsx          popover.tsx         select.tsx          separator.tsx   tabs.tsx
                                                            sheet.tsx       textarea.tsx
                                                                            tooltip.tsx
```

**`button.tsx` — variants for the demo** (CVA, copied from source):

| Variant | Visual |
|---|---|
| `default` | `bg-primary text-primary-foreground` → near-black bg, white text |
| `outline` | `border-border bg-background hover:bg-muted` → bordered, white bg |
| `secondary` | `bg-secondary text-secondary-foreground` → light grey bg |
| `ghost` | transparent, `hover:bg-muted` |
| `destructive` | `bg-destructive/10 text-destructive` → light red bg, red text |
| `destructiveSolid` | `bg-semantic-danger text-white` → solid red |
| `link` | `text-primary underline-offset-4 hover:underline` |

**Sizes:** `xs (h-6)`, `sm (h-7)`, `default (h-8)`, `lg (h-9)`, plus icon variants. **Smaller than typical** — built for dense product UI.

**Custom UI bits worth noting:**
- `platform-logo.tsx` — renders brand SVG marks for ~26 platforms. **Source of truth for the Reach composition's logo wall.**
- `resizable.tsx` — wraps `react-resizable-panels` (used by claims shell).

---

## 6. Heavy / non-trivial deps

| Dep | Where used | Notes for demo |
|---|---|---|
| **`recharts@3.8.1`** | `purchase/price-history-chart.tsx` | Real chart is a `<LineChart>`. For composition 6.3 (the drop), hand-roll an SVG `<polyline>` + an `<animateTransform>` or GSAP — cheaper than embedding Recharts in HyperFrames. |
| **`react-resizable-panels@4.11.1`** | claims shell, draft pane chrome | Composition fakes this with plain CSS flex columns (no need for resizing in a 6-second clip). |
| **`@base-ui/react@1.4.1`** | All `components/ui/*` primitives | Just CSS surface — composition is plain HTML. |
| **`motion@12.38.0`** | Likely landing animations, FAB | Composition uses GSAP per `STORYBOARD.md`; don't mix. |
| **`lucide-react@1.14.0`** | Every icon | Composition can either import SVG paths inline or embed the relevant Lucide SVG source for each icon. (`Mail`, `FileText`, `Sparkles`, `Send`, `TrendingDown`, `Receipt`, etc.) |
| **`react-markdown@10.1.0`** | Assistant message rendering | Composition writes the message as plain HTML. |
| **`firebase@12.13.0`** | Auth only | Irrelevant for static composition. |
| **`recharts`**, **`react-day-picker`**, **`react-dropzone`** | Various | Replace with hand-built SVG / HTML as needed. |

---

## 7. Layout chrome (`AuthenticatedShell`)

`apps/web/src/components/layout/authenticated-shell.tsx` (247 lines) wraps `(authenticated)` routes. Provides:
- **Left sidebar** (`lg+` only) — navigation (Dashboard / Purchases / Claims / Settings / etc.), Upload CTA, profile menu at bottom.
- **Top header** — search, theme toggle, user avatar.
- **Floating Assistant FAB** — bottom-right, animated ring pulse on proactive events.

**For Section 6.5 specifically:** the storyboard says capture the `/claims/[id]` three-pane and zoom into the assistant. The product's actual chrome (sidebar, header, FAB) would distract from the pane content. **Recommendation: omit the AuthenticatedShell chrome in the composition** — render only `<ClaimHeader>` (the breadcrumb + actions row, which IS part of the claims page itself, not the global shell). This is faithful enough to be recognizable as ClaimIt while keeping the three panes the visual focus.

---

## 8. Demo data — hard-coded values per script

For composition 6.5 (and beat 6.3 / 6.7), use **exactly these values** so the script's VO lines stay synced with what's on screen:

| Field | Value |
|---|---|
| Product name | `Apple AirPods Pro` |
| Order ID | `BBY-201-AIRPODS` |
| Platform | `Best Buy` |
| Purchase date | `May 14, 2026` |
| Original price | `$199.00` |
| Current price | `$149.00` |
| Refund amount | `$50.00` |
| Member tier | `Best Buy Plus` (60-day window) |
| Days remaining | `8 days` (script line "8 days to get $50 back") |
| Window remaining text | `8d 14h` for header pill |
| Captured at | `Just now` |
| Recipient email (To) | `claims@bestbuy.com` |
| Subject | `Price adjustment request — order BBY-201-AIRPODS` |
| Policy clause (highlight) | `If a qualifying item you bought from Best Buy is reduced in price within 15 days of purchase (or 60 days for Plus members), we'll refund the difference upon request.` |
| Email draft body | See composition source |
| Status badge | `Awaiting Approval` |
| Source URL | (omit / decorative only) |

---

## 9. What was missing / harder to replicate

Things that were *not* obvious from the codebase and would benefit from human guidance for later compositions:

1. **`AuthenticatedShell` is heavy** — sidebar + header + FAB is ~240 lines of nested layout. **Skipping it for individual demo beats is the right call**, but the wide-shot dashboard (Section ⑦) would need a faithful version.
2. **`platform-logo.tsx` SVG library** — I didn't open every logo. For the Reach wall (Section ⑦), the demo will need to either import the SVGs from `components/ui/platform-logo.tsx` or rebuild them. Worth a follow-up scan.
3. **`recharts` price chart configuration** — colors, axes, tooltips. Section 6.3 will need to look like the real chart; either screenshot the rendered shape (one-time, not "capture pipeline") or replicate via plain SVG.
4. **Real email draft body text** — the agent generates this; there's no fixed "demo email" string in the codebase. **The demo composition needs an authored prose draft** that reads natural for the VO timing. Drafted in 6.5 — review and revise as needed.
5. **Loading states** — the real shell shows a `<ClaimDetailSkeleton>` for ~300ms while data loads. **Composition skips the skeleton** (it would just add noise to a 10-second clip). If the storyboard ever wants a "loading → resolved" beat, we can mock the skeleton easily.

The codebase was **highly readable** overall — comments are dense (often multi-paragraph explainers tying decisions to PR / CodeRabbit findings), type definitions are explicit, and the component split is clean. No file required guessing. The recon for sections 6.1, 6.2, 6.3, 6.4, 6.7 should each be 30–60 minutes of similar focused reading.

---

## 10. Composition build order — recommended

1. **6.5 three-pane** (this turn) — biggest layout, baseline for the visual language
2. **6.2 extraction confirm** — reuses card + checkmark + receipt-preview vocabulary
3. **6.3 the drop** — purchase detail w/ price chart (hand-built SVG)
4. **6.7 approve flow** — same 3-pane as 6.5 with the Approve action animated + post-approve banner
5. **6.6 assistant zoom** — same Assistant pane, scaled up
6. **6.4 four-types** — pure typography on soft black, easy
7. **6.1 inbox-to-dashboard** — Gmail mockup + dashboard slide-in (most layout-heavy after 6.5)
8. **⑦ Reach** — 26-logo wall (needs platform-logo SVG extraction)
9. **②/③/④/⑤/⑧** — pure typography, easy

---

## Changelog

```
v1.0 — 2026-05-31 — Initial recon for hand-built compositions.
```
