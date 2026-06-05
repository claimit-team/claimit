# UI Integration Map — apps/web

> **Purpose**: authoritative reference for how `apps/web`'s UI actually *composes*
> on each page (sidebar + header + content + panes), so demo-video beats show the
> *integrated* product, not isolated cards. Read-only audit output.
> **Date**: 2026-06-03 · **Author**: Claude Code · **Scope**: `apps/web/` (paths relative to repo root)
> **Method**: full read of layouts, shared chrome (`components/layout/*`), the claim panes, and every authenticated `page.tsx`.

---

## §1 Tech stack & token system

| Aspect | Reality |
|---|---|
| Framework | **Next.js 16.2.6**, **React 19.2.4**, **App Router** (route groups). `package.json` scripts use `next dev/build --webpack`. |
| Language | TypeScript 5; lint/format via **Biome** (`biome.json`), not ESLint/Prettier. Tests: **vitest**. |
| Styling | **Tailwind CSS v4** (`@import "tailwindcss"` in `globals.css`; PostCSS via `@tailwindcss/postcss`). **No `tailwind.config.ts`** — config lives in `globals.css` via `@theme inline { … }`. `tw-animate-css` for animation utilities. |
| Component lib | **shadcn ^4.7.0 built on `@base-ui/react` ^1.4.1** (not Radix). Primitives in `apps/web/src/components/ui/`. Buttons use a base-ui `Button` + CVA variants; some components use base-ui `useRender`/`mergeProps` + a `render={…}` prop instead of `asChild`. |
| Icons | **lucide-react ^1.14.0** (everywhere). |
| Forms / data | **No React Hook Form, no SWR, no React Query.** Data via **custom hooks** (`useClaims`, `usePurchases`, `useNotifications`, `useDashboardSummary`, `useAssistantStream`, `useConversations`, …) → `lib/api/*` (fetch with a Firebase ID token) + **zustand ^5** stores (`src/store/*`) + **SSE** (`lib/sse/*`) for live updates. `recharts ^3.8` (charts), `react-dropzone` (upload), `react-markdown`+`remark-gfm` (assistant), `react-resizable-panels ^4.11` (claim shell), `react-day-picker` (calendar), `date-fns`, `motion ^12.38` (Framer Motion), `sonner ^2` (toasts), `next-themes` (light/dark/system), `firebase ^12` (auth). |

### Design tokens (`apps/web/src/app/globals.css`)

Two layers: (a) **shadcn primitives in OKLCH grayscale** (`--background`, `--foreground`, `--primary`, `--card`, `--muted`, `--border`, `--ring`, …) used by base UI chrome; (b) **ClaimIt brand tokens in HSL** exposed as Tailwind utilities (`bg-brand-primary-500`, `text-neutral-700`, …):

- **brand-primary** (Deep Navy, hue 217): `50…900`. e.g. `500 = hsl(217 50% 30%)`, `600 = 22%`, `700 = 17%`. Used for primary CTAs, active nav, links, logo.
- **brand-accent** (Forest Green, hue 142): `50…900`. **Commented "RECLAIMED MONEY ONLY"** → reserve green for money-back moments.
- **neutral** (cool navy-tinted, hue 220): `0 (white) … 900`. Surfaces + text.
- **semantic**: `success = brand-accent-500` (green), `warning = hsl(35 90% 50%)` (amber), `danger = hsl(0 70% 50%)` (red), `info = hsl(210 90% 55%)` (blue) — each with a `-bg` companion.
- **radius**: `--radius: 0.625rem` (**10px**); `sm 0.6× / md 0.8× / lg 1× / xl 1.4× / 2xl 1.8× / … / 4xl 2.6×`. → cards `rounded-xl` (~14px), buttons `rounded-lg` (10px), badges fully-round.
- **fonts**: **Inter** via `next/font/google` (`--font-sans`, variable, `display:swap`); `--font-heading = --font-sans`; `--font-mono` = SF Mono stack. `body { font-feature-settings: "cv11","ss01","ss03","cv02" }`.
- Full **dark mode** (`.dark` block, brand lifted ~30%, neutrals inverted). Default theme = **system**.
- Keyframes defined in `globals.css`: `marquee-left/right`, `shimmer`, `breathe` (scale 1→1.04), `ring-pulse` (`cubic-bezier(0.16,1,0.3,1)`), `pulse-dot`; `prefers-reduced-motion` respected. A `@media print` block powers the in-store-guide print path (`body.printing-in-store-guide`).

---

## §2 Root + route-group layouts

| Layout | File | Type | Renders / providers | Shared chrome |
|---|---|---|---|---|
| **Root** | `app/layout.tsx` | server | `<html><body class={inter.variable}>` → `ThemeProvider` (next-themes, `defaultTheme="system"`) → `AuthInit` → `TooltipProvider` → `{children}` + `<Toaster/>` (sonner) | none (pure providers) |
| **(authenticated)** | `app/(authenticated)/layout.tsx` | **client** | Auth guard via `useAuthStore`: spinner while loading; `→/login` if no user; `→/onboarding` if `!user.onboarded`; else `<AuthenticatedShell>{children}</AuthenticatedShell>` | **full app shell** (sidebar + header + FAB + global UploadDialog) |
| **(onboarding)** | `app/(onboarding)/layout.tsx` | server | `<OnboardingGate>` (client guard: →/login if logged out, →/dashboard if already onboarded) → centered `<main>` (max-w ~560px) | **none** (stripped — no sidebar/header/footer) |
| **(public)** | `app/(public)/layout.tsx` | server | `<PublicHeader/> <main class="flex-1">{children}</main> <PublicFooter/>` | marketing header + footer |
| **(public-auth)** | `app/(public-auth)/layout.tsx` | server | `<PublicHeader/> {children}` (no footer — keeps `/login` focused) | marketing header only |
| **help** | `app/help/layout.tsx` | **client (polymorphic)** | if `user?.onboarded` → `<AuthenticatedShell>`; else → `<PublicHeader/> + <PublicFooter/>` | depends on auth state |

---

## §3 Shared chrome components

### AuthenticatedShell — `components/layout/authenticated-shell.tsx`
The wrapper every authenticated page sits inside. Structure:

- **Outer**: `min-h-screen bg-neutral-0` (white).
- **Left sidebar** (`<aside>`): `hidden lg:flex`, **fixed, `lg:w-64` (256px)**, full height, `border-r border-neutral-200`, white. Renders `<SidebarContent/>`. Below `lg` it's hidden and reached via a **Sheet** drawer (hamburger in header, `side="left" w-64`).
- **Header** (`<header>`): **sticky top-0, z-40, `h-16` (64px)**, white, `border-b`, `px-4 lg:px-8`, content area is `lg:pl-64`. Contents L→R:
  - (mobile only) hamburger `Menu` + ClaimIt logo (ShieldCheck + "ClaimIt").
  - right cluster: `SseReconnectChip` ("Reconnecting…" badge when SSE drops), **ThemeToggle**, **Notifications `Bell`** link → `/notifications` with an unread-count badge (`bg-brand-primary-600`, "99+" cap), **User dropdown** (`UserAvatar` + name + `ChevronDown`).
  - User dropdown menu: name + email; plan badge (`Free/Pro/Family plan` from `settings-mock`) + "Manage"→/settings/billing; "Settings"→/settings; "Help and support"→/help; **Theme** chips (Light/Dark/System); **Sign out** (`text-semantic-danger`).
- **Main**: `flex-1`.
- **FloatingAssistant** FAB (`variant="default"`) bottom-right — **hidden on `/assistant` and `/claims/[id]`** (`fabHidden`).
- **Global `<UploadDialog/>`** mounted here (opened via `useUIStore.setUploadDialogOpen`).
- `data-print-hide` on sidebar+header+FAB (in-store-guide print path).

### SidebarContent — `components/layout/sidebar.tsx`
- Top: `h-16` logo row (`ShieldCheck` brand-primary-500 + "ClaimIt", `border-b`).
- **Nav groups (verbatim, in order):**
  - **Main**: Dashboard (`LayoutDashboard`) → /dashboard · Claims (`FileText`) → /claims · Purchases (`ShoppingBag`) → /purchases
  - **Assistant**: Assistant (`BotMessageSquare`) → /assistant · Notifications (`Bell`) → /notifications
  - **Actions**: **Upload receipt** (`Receipt`) — a **button** that opens the global UploadDialog (NOT a link/route)
  - (separator) bottom: Settings (`Settings`) → /settings · Help (`HelpCircle`) → /help
  - footer: muted "**ClaimIt Beta v1.0**"
- **Active state**: `bg-brand-primary-50 text-brand-primary-600`; inactive `text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900`. Items are `rounded-lg px-3 py-2 text-sm font-medium`, icon `w-5 h-5`.
- **Collapse**: not collapsible; shown ≥ `lg` (1024px), hidden below → Sheet drawer.
- **Z-index**: sidebar is in normal flow (fixed aside, no explicit z); header `z-40`; FAB `z-50`.

### FloatingAssistant — `components/layout/floating-assistant.tsx`
- **default variant**: FAB bottom-right (`w-12 h-12 md:w-14 md:h-14`, `bg-brand-primary-500`, `MessageSquareText`), **`z-50`**; pulses (`ring-brand-accent-500 animate-ping`) when a proactive event is pending. Click → **FloatingPanel** slide-over (`bottom-16 right-0`, `max-w-26rem`, `max-h-36rem`, `rounded-xl shadow-xl`): header "ClaimIt Assistant" / "Ask me anything about your claims" (`bg-brand-primary-500`), a `<ProactiveCard>`, scrollable message bubbles (user = `bg-brand-primary-600`, assistant = `bg-neutral-50` + markdown + streaming spinner), and a textarea+Send form. This is a stripped general-mode chat (full UI at /assistant).
- **pill variant**: used on `/claims/[id]` — a slim pill ("Assistant" / "Shrink") that expands/collapses the *embedded* claim assistant pane (no slide-over).

### PublicHeader — `components/layout/public-header.tsx`
Sticky `h-16`, `max-w-6xl`, `z-50`. Logo (ShieldCheck + "ClaimIt") → `/`. Nav (verbatim): **How it works** (/how-it-works), **Pricing** (/pricing), **Security** (/security), **Help** (/help). ThemeToggle. CTA: logged-out → "Log in" (ghost) + "Try free" (primary) → /login; logged-in → "Go to dashboard". Mobile = hamburger dropdown.

### PublicFooter — `components/layout/public-footer.tsx`
Full footer (logged-out / onboarding): columns **Product** (Pricing, How it works), **Company** (Team, Careers, Security), **Resources** (Help center, Blog, Changelog, Contact), **Legal** (Privacy policy, Terms of service) + newsletter form + social (X, LinkedIn, GitHub, YouTube) + copyright. Slim footer (logged-in onboarded): single row copyright + Privacy/Terms/Contact.

### ThemeToggle — `components/layout/theme-toggle.tsx`
Light/Dark/System switcher (also surfaced as chips in the user dropdown).

---

## §4 Page-by-page composition (CORE)

All authenticated routes inherit **sidebar + header + FAB** from `(authenticated)/layout.tsx → AuthenticatedShell`; the blocks below describe the **content area** (the `<main>` under `lg:pl-64`). All are `'use client'` unless noted.

### /dashboard
**File:** `app/(authenticated)/dashboard/page.tsx` · **Layout:** (authenticated)
**Composition (top→bottom):**
- Page header strip — h1 "**Dashboard**" + subtitle "*Monitor purchases, review claims, and keep your refund workflow moving.*"; right: Gmail-status badge / "Connect Gmail", "Upload receipt" button; *(dev-only state switcher + pulse trigger)*.
- **Hero** (conditional on user state): `dashboard/hero/new-user.tsx` (new) | `active-user.tsx` (claims/monitored counts) | `reclaim-experienced.tsx` (money reclaimed, lifetime savings — uses `animated-currency.tsx`).
- `<AutoSendBanner>` (`dashboard/auto-send-banner.tsx`) — stacked "Sending {platform} in MM:SS" rows (queued claims).
- **Needs your attention** — grid of `ConfirmExtractionCard` / `ReviewDraftCard` / `AwaitingOutcomeCard`; empty "Nothing needs your attention right now."
- **Monitored purchases** — table (Platform · Item · Category · Status · Window) via `MonitoredPurchaseRow`; skeleton/empty states.
- **Quick upload** (dashed dropzone button) + **Recently resolved** activity list.
**Data:** `useDashboardSummary` (`/api/v1/dashboard/summary`), `useMonitoredPurchases`, `usePendingConfirmation`, `useReviewDraft`, `useAwaitingOutcomeClaims`, `useQueuedForSendClaims`, `useAuthStore`, `useUIStore`.
**Demo beats:** **b15** (watch) — needs full chrome + monitored-purchases + price-watch indicator.

### /claims
**File:** `app/(authenticated)/claims/page.tsx` · **Layout:** (authenticated)
**Composition:** h1 "**Claims**" + subtitle "*Track drafts, submissions, and outcomes across every monitored purchase.*"; **sticky filter bar** (status chips All/Pending/In progress/Resolved with counts + search "Search platform or product…"); **desktop table** (`ClaimRow`: Status · Platform/Product · Type · Amount · Window/Resolved · Submitted · View) / **mobile cards** (`ClaimCard`); "Load more"; rich empty/loading/error states. `ClaimOutcomeBadge` for status pills.
**Data:** `useClaims` (`/api/v1/claims` list, filter+cursor).
**Demo beats:** **b27** (claims list bridge).

### /claims/[id] — **the 3-panel ClaimShell** (see §5 for the deep dive)
**File:** `app/(authenticated)/claims/[id]/page.tsx` · **Layout:** (authenticated)
**Composition:** owns a load state machine (loading→`ClaimDetailSkeleton` 3-pane / ready→`<ClaimDetailShell>` / notFound / error). `use(params)` for the id; request-sequence guard; optimistic patch + refetch.
**Data:** `getClaimDetail(id)` → `GET /api/v1/claims/:id` (enriched bundle → `buildClaimDetailViewModel`).
**Demo beats:** **b19–b24** (headline), **b25** (approve), **b26** (sent → toast + PostApproveBanner).

### /purchases
**File:** `app/(authenticated)/purchases/page.tsx` · **Layout:** (authenticated)
**Composition:** h1 "**Purchases**" + subtitle "*Every receipt we monitor — see status, timelines, and what needs action.*"; sticky **category** chips (All/Retail/Airline/Hotel + counts) + search "Search platform, product, or order…"; desktop table (`PurchaseRow`: Status · source icon · Platform/Product · Category · Price paid · Purchase date · Window · View) / mobile `PurchaseCard`; source icon = Gmail/upload/neutral; degraded-monitor amber dot; "Load more".
**Data:** `usePurchases` (`/api/v1/purchases`).
**Demo beats:** (b15 context / list B-roll).

### /purchases/[id]
**File:** `app/(authenticated)/purchases/[id]/page.tsx` · **Layout:** (authenticated)
**Composition:** state machine → `<PurchaseDetailContent>` (`components/purchase/purchase-detail-content.tsx`) which composes `purchase-page-header.tsx`, **`price-history-chart.tsx` (recharts)**, `refund-eligibility-card.tsx` ("days remaining" window), `original-purchase-details.tsx`, `related-claims-card.tsx`; dialogs: add-product-url, reupload-receipt, stop-monitoring.
**Data:** `getPurchaseDetail(id)` → `GET /api/v1/purchases/:id`.
**Demo beats:** **b16–b17** (price chart + drop — the real recharts chart lives HERE).

### /confirm/[purchaseId]
**File:** `app/(authenticated)/confirm/[purchaseId]/page.tsx` · **server** wrapper → `<Suspense>` → `<ConfirmPurchaseLoader>` (client)
**Composition:** `confirm/confirm-purchase-content.tsx` → `confirm-page-header.tsx`, `receipt-preview.tsx` (left, image preview), `extraction-review-form.tsx` (right: Merchant/Item/Date/Price/Category/etc. editable fields), `confidence-banner.tsx`, `window-warning-banner.tsx`, `multi-item-selection.tsx`, sticky `action-bar.tsx` (Cancel / Confirm). Polls extraction analysis if in progress.
**Data:** client-side API via loader; `POST /api/v1/purchases` on confirm.
**Demo beats:** **b12–b14** (OCR extraction + confirm fields).

### /assistant/[[...conversationId]]
**File:** `app/(authenticated)/assistant/[[...conversationId]]/page.tsx` · **Layout:** (authenticated, FAB hidden)
**Composition:** thin wrapper → `<AssistantContent conversationId={…}/>` (`components/assistant/assistant-content.tsx`) — full chat: conversation list + message stream (`markdown-message.tsx`), proactive cards, search. Optional catch-all: `/assistant` (new) or `/assistant/{id}` (resume).
**Data:** `useConversations`, `useAssistantStream` (SSE).
**Demo beats:** (none directly in b10–27; the *claim-focused* assistant is the §5 Assistant pane).

### /notifications
**File:** `app/(authenticated)/notifications/page.tsx` · **Layout:** (authenticated)
**Composition:** h1 "**Notifications**" + subtitle "*Alerts from claims monitoring, Gmail ingest, and the assistant — all in one stream.*"; "Mark all read"; `notification-filter.tsx` (All/Unread + event-type); date-grouped sections (Today/Yesterday/Earlier) of `notification-row.tsx` (dismiss + click→route); `notification-empty.tsx`; "Load more".
**Data:** `useNotifications` (ack/ackAll, cursor).
**Demo beats:** (none in b10–27).

### /settings (+ children)
- **/settings** — **server, redirect → /settings/account** (stub index). `settings-nav.tsx` provides the tab nav across children.
- **/settings/account** — `account-profile-card` (name) + `sign-in-provider-card` (Google) + `session-actions-card` (sign out). Data: `useAuthStore`, `patchUserMe`.
- **/settings/billing** — ⚠️ **fully MOCKED** (`settings-mock.ts`): current plan + Upgrade/Payment/Invoices/Cancel; all actions toast "*not available yet*". No API.
- **/settings/gmail** — server wrapper → `gmail-settings-content.tsx` (connect/disconnect Gmail).
- **/settings/notifications** — 7 event toggles + email channel (push "Coming soon"). Data: `updateNotifications` (`PUT /api/v1/settings/notifications`).
- **/settings/preferences** — "Send preferences": radio **Approve each claim** vs **Send automatically** (5-min cancel window), per-platform overrides "Available soon". Data: `updateSendPreference`.
**Demo beats:** (none in b10–27.)

### Public / onboarding / auth routes (not demo-critical — compact)
| Route | File | Notes |
|---|---|---|
| `/` (landing) | `(public)/page.tsx` | stacks `HeroSection` → `LogoWallSection` → `HowItWorksSection` → `OutputTypesSection` → `SocialProofSection` → `FinalCtaSection` |
| `/how-it-works`,`/pricing`,`/security`,`/team`,`/blog`(+`[slug]`),`/careers`(+`[slug]`),`/changelog`,`/privacy`,`/terms` | `(public)/…` | marketing pages (PublicHeader+Footer); `/privacy`,`/terms` = `LegalDocumentView` |
| `/login`, `/login/verify` | `(public-auth)/login/…` | `auth/login-view.tsx` (email + Google/GitHub), post-OAuth overlay |
| `/onboarding`, `/onboarding/gmail`, `/onboarding/preferences` | `(onboarding)/…` | stripped chrome; `welcome-card`, `step-indicator`, `flow-preview` |
| `/help`, `/help/contact` | `help/…` | polymorphic chrome; `help-view`, `contact-support-view` |
**MISSING — not built as routes:** `/upload` (upload is a **global Dialog**, not a page — see §7). No other expected route is missing.

---

## §5 The 3-panel ClaimShell (deep dive)

**Component:** `apps/web/src/components/claims/claim-detail-shell.tsx` — exported **`ClaimDetailShell`** (NOT "ClaimShell"/"ClaimReview"). Rendered by `app/(authenticated)/claims/[id]/page.tsx`.

**Outer structure:** `<div class="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">` →
1. `<ClaimHeader/>` (sticky top bar — see action buttons below)
2. `<PostApproveBanner/>` (info banner after approval; `data-print-hide`)
3. the resizable pane region (`bg-neutral-50`).

**Layout (desktop ≥1024px)** — `react-resizable-panels` (`ResizablePanelGroup`), resizable + double-click-to-maximize:
- **Outer horizontal split**: **Draft 40%** | `ResizableHandle` | **right-column 60%**.
- **Right column vertical split**: **Evidence 60%** | `ResizableHandle` | **Assistant 40%**.
- Presets: draft-max (80/20), evidence-max (90/10), assistant-max (10/90, triggered by the floating "Assistant" pill).
- **Tablet (≥768)**: Draft 50% | tabbed Evidence/Assistant 50%. **Mobile (<768)**: a 3-tab switch (Draft / Evidence / Assistant). (`useMediaQuery`.)

**Pane 1 — Draft** (`components/claims/draft-pane.tsx`):
- Header: claim-type icon + title (**"Email Draft"** / "Chat Script" / "In-Store Guide" / "Self-Service Walkthrough") + `Maximize2`.
- **Version dropdown**: `v{N} of {total} · {source} · {relative time}` where source = "AI draft" | "You edited" | "Assistant rewrite"; "Back to latest" when off-latest.
- **Preview / Edit tabs** (Edit only when `claim_type==="email"` **and** status editable **and** on latest; else a disabled tab with tooltip "Switch to the latest version to edit").
- **Preview** = type-specific renderer: Email = To/Subject card (`bg-neutral-50`) + body (`whitespace-pre-wrap`, **prose font, NOT monospace/`<pre>`**); Chat = numbered steps + collapsible escalation + per-step Copy; In-Store = 5 sections + call-ahead (this subtree is `data-print-target`); Self-Service = platform + "~N min" badge + Paid/Now/Save price callouts + steps/notes + "Open {platform}". Empty → "No draft yet" alert; parse mismatch → `FallbackPre`.
- **Edit** = (email) Subject `Input` + body **`Textarea` (`min-h-80`, `font-mono`) — a plain editable textarea, NOT a rich-text editor** + footer Discard / "Save changes" (`editClaimDraft` → new version).
- **Regenerating overlay**: `absolute inset-0 bg-neutral-0/80 backdrop-blur` + spinner "Regenerating draft…" while an assistant redraft is in flight (45s timeout → "Taking longer than expected").
- Unsaved-changes guard `Dialog` ("Discard unsaved edits?").

**Pane 2 — Evidence** (`components/claims/evidence-pane.tsx`), in `ScrollArea`, three `Card`s in order:
1. **Current price** — `TrendingDown` (amber); `Original: $X` (muted) over current `$Y` (`text-2xl`); right `-$diff` (`text-semantic-warning`) + "difference"; **price-drop screenshot** (loaded via `fetchEvidenceBlob` → `GET /api/v1/claims/:id/evidence` proxy, click-to-zoom Dialog; states loading/missing/error/ready); source line ("Source: {platform}", linkable) + captured timestamp.
2. **{platform} price match policy** — highlighted cited clause `<blockquote>` (amber left border + `bg-semantic-warning-bg/30`, italic) + "Read {platform} policy" external link + "Policy verified {date}".
3. **Your original purchase** — dashed receipt placeholder + grid (Purchase date / Order ID `font-mono` / Price paid) + "View purchase" → /purchases/{id}.

**Pane 3 — Assistant** (`components/claims/assistant-pane.tsx`) — the **claim-focused** chat:
- Header: `Sparkles` (brand-primary) + "Assistant" + Badge "**🎯 Claim-focused**" (`bg-brand-primary-50`).
- Full message history (`MessageBubble`): assistant = `Bot` + `bg-neutral-100`; user = `User` + `bg-brand-primary-500`. Markdown render, streaming spinner, tool-call badges ("Running {tool}…", "Tools · …"), "View trace" → Phoenix span link.
- **Quick actions** (verbatim): **"Make it friendlier"**, "Why this template?", "Explain the policy match", "Switch to manual approval".
- Input: `Textarea` "Ask about this claim..." + `Send` icon button. Powered by `useConversations({mode:"claim_focused"})` + `useAssistantStream` (SSE).

**Action buttons (in `ClaimHeader`, sticky top — NOT a floating bottom bar):** per `status`:
- `awaiting_approval`: **Edit draft** (email only) · **Cancel claim** (danger) · **Approve and send** (primary; label via `getApproveAction`, gated on Gmail-connected).
- `queued_for_send`: "Sending in MM:SS" countdown · Cancel · Send now.
- `submitted`: "Approved / refunded" · "Denied".
- `approved`: "Reclaimed $X" (green check) + "View receipt" (**disabled — BUG-125**).
- `denied`: reason + "Try a different angle".
- in-store guide: "Download PDF" (print). Confirm dialogs: `approve-confirm-dialog`, `cancel-confirm-dialog`, `outcome-approved/denied-dialog`.

**Cross-pane interaction:** the Assistant pane, when it runs `request_redraft`, starts `useClaimRedraftProgressStore` → the Draft pane shows the regenerating overlay; on the new version landing the Draft pane refetches and the version dropdown gains a "v+1 · Assistant rewrite". The shell threads `refetch` + `applyOptimistic` through all three. The floating **"Assistant" pill** (FAB pill variant) maximizes the embedded Assistant pane (`useUIStore.claimEmbeddedAssistantExpanded`).

---

## §6 Component inventory (`apps/web/src/components/`)

**ui/ (shadcn-on-base-ui primitives, used everywhere):** accordion, alert, avatar, badge, button, calendar, card, collapsible, dialog, dropdown-menu, input, label, platform-logo, popover, progress, radio-group, **resizable**, scroll-area, select, separator, sheet, skeleton, **sonner**, switch, table, tabs, textarea, tooltip.

| Folder | Components | Used on |
|---|---|---|
| **layout/** | `authenticated-shell`, `sidebar`, `floating-assistant`, `theme-toggle`, `public-header`, `public-footer` | all authenticated / public chrome |
| **claims/** | `claim-detail-shell`, `claim-header`, `draft-pane` (+`draft-parsers`), `evidence-pane`, `assistant-pane`, `approve-confirm-dialog`, `cancel-confirm-dialog`, `outcome-approved-dialog`, `outcome-denied-dialog`, `post-approve-banner`, `claim-outcome-badge`, `platform-logo` | /claims, /claims/[id] |
| **purchase/** | `purchase-detail-content`, `purchase-page-header`, `price-history-chart` (recharts), `refund-eligibility-card`, `original-purchase-details`, `related-claims-card`, `add-product-url-dialog`, `reupload-receipt-dialog`, `stop-monitoring-dialog` | /purchases, /purchases/[id] |
| **confirm/** | `confirm-purchase-content`, `confirm-purchase-loader`, `confirm-page-header`, `extraction-review-form`, `receipt-preview`, `confidence-banner`, `window-warning-banner`, `multi-item-selection`, `action-bar` | /confirm/[purchaseId] |
| **dashboard/** | `auto-send-banner`, `hero/{new-user, active-user, reclaim-experienced, animated-currency}` | /dashboard |
| **assistant/** | `assistant-content`, `markdown-message`, `proactive-card` | /assistant, FAB |
| **notifications/** | `notification-filter`, `notification-group`, `notification-row`, `notification-empty` | /notifications |
| **upload/** | `upload-dialog` | global (sidebar/FAB/dashboard) |
| **settings/** | `settings-nav`, `gmail-settings-content`, `settings-mock`, `account/{account-profile-card, sign-in-provider-card, session-actions-card}` | /settings/* |
| **onboarding/** | `welcome-card`, `step-indicator`, `flow-preview` | /onboarding/* |
| **auth/** | `auth-init`, `login-view`, `post-oauth-overlay`, `google-mark`, `github-mark` | root provider, /login |
| **user/** | `user-avatar` | header, etc. |
| **landing/** | `hero-section`, `logo-wall-section`, `how-it-works-section`, `output-types-section`, `social-proof-section`, `final-cta-section`, `claim-detail-demo` | / |
| **how-it-works/, security/, team/, pricing/, blog/, careers/, changelog/, help/, legal/** | marketing-page section components | respective public routes |
| (root) | `theme-provider` | root layout |

---

## §7 Gaps & inconsistencies (honest)

1. **No `/upload` route.** Upload is a **global `UploadDialog`** opened from the sidebar "Upload receipt" button, the FAB `navigate_upload` action, and the dashboard. A demo "upload" beat must show the **dialog**, not a page. (Ticket 5.14 removed the route.)
2. **`/settings` is a redirect stub** (→ /settings/account). **`/settings/billing` is fully MOCKED** (`settings-mock.ts`; actions toast "not available yet"). Push notifications and per-platform send overrides are "Coming soon".
3. **Naming:** the 3-pane component is **`ClaimDetailShell`** (file `claim-detail-shell.tsx`); panes are `DraftPane` / `EvidencePane` / `AssistantPane`. (The demo shim is named `ClaimShell` — rename mentally when mapping.)
4. **`View receipt` is disabled (BUG-125)** — the reclaimed-amount receipt link isn't surfaced from the API yet.
5. **Server vs client:** `/settings` (server redirect), `/settings/gmail` (server wrapper), `/confirm/[purchaseId]` (server wrapper → client loader) are the only non-client authenticated pages; everything else is `'use client'`. Layouts: root/(public)/(public-auth)/(onboarding) server; (authenticated)/help client.
6. **Direct import into Remotion is NOT viable for the claim panes.** `ClaimDetailShell` + panes depend on: zustand stores (`useUIStore`, `useClaimDetailRefetchStore`, `useClaimRedraftProgressStore`, `useClaimAssistantPromptStore`), **`react-resizable-panels`** (`GroupImperativeHandle`), `useMediaQuery`, live data hooks (`useAssistantStream` SSE, `useConversations`, `fetchEvidenceBlob` → api-gateway), `next/link`, `sonner`, `react-markdown`, `lucide-react`. → **ADAPTED rebuild is the right call** (done in the last surgical fix); these cannot be imported.
7. **Remotion-incompat primitives present across apps/web:** `next/link` (sidebar, header, breadcrumbs, all nav), `next/image` (marketing pages; evidence pane uses a plain `<img>` for a blob URL), SSE/`window`-reaching hooks, `react-resizable-panels`. Any "import the real component" path must strip these.
8. **No standalone "SentBanner" component.** The "claim sent" confirmation is a **`sonner` toast** + the **`post-approve-banner.tsx`** info strip on `/claims/[id]` — not a dedicated banner screen. (Demo b26's `SentBanner` shim approximates the toast.)
9. **The real price chart lives on `/purchases/[id]`** (`price-history-chart.tsx`, recharts) and the **evidence pane** (price-drop screenshot, not a chart). Demo b16–17 should reference the purchase-detail chart.
10. **No stub/TODO pages** otherwise — all marketing + app routes render real content. `settings/billing` is the one mock.
11. **Demo-shim sidebar is incomplete vs real:** the real sidebar has groups **Main** (Dashboard/Claims/Purchases), **Assistant** (Assistant/Notifications), **Actions** (Upload receipt button), then **Settings/Help** + "ClaimIt Beta v1.0". The current demo `AppShell` shim only lists Dashboard/Claims/Purchases/Assistant → should be expanded for b15/b27 fidelity.

---

## §8 Demo beat → apps/web route/surface mapping (b10–b27)

| Beat | Subtitle (v3.1, verbatim) | apps/web surface | Notes for next phase |
|---|---|---|---|
| b10 | "It starts with a receipt." | — (pre-upload) | No UI surface; physical receipt visual. Keep designed. |
| b11 | "Upload a photo or a PDF — or let ClaimIt read it from your inbox." | **global `UploadDialog`** (`upload/upload-dialog.tsx`) | NOT a route — it's a modal over the dashboard. Show dialog over real chrome if going for fidelity. |
| b12 | "ClaimIt pulls out the details for you." | `/confirm/[purchaseId]` (`extraction-review-form` + `receipt-preview`) | full chrome + confirm layout |
| b13 | "The merchant, the item, the date, and the price." | `/confirm/[purchaseId]` `extraction-review-form` | fields: Merchant/Item/Date/Price (+Category, Order id) |
| b14 | "Each value lifted from the receipt — yours to check and correct." | `/confirm/[purchaseId]` (editable fields + `confidence-banner`) | "extracted" + low-confidence styling |
| b15 | "Then it watches the claim window in the background." | **`/dashboard`** | **needs FULL chrome** — real sidebar groups + header + Monitored-purchases table + price-watch; current shim sidebar is incomplete (§7.11) |
| b16 | "Days pass, and it keeps checking the price for you." | `/purchases/[id]` `price-history-chart` (recharts) | real chart lives on purchase detail |
| b17 | "When Costco drops the price, ClaimIt catches it." | `/purchases/[id]` chart + a `sonner` toast / dashboard proactive card | drop annotation + toast |
| b18 | "It checks the policy, so you do not have to." | `/claims/[id]` Evidence-pane **policy card** (or `refund-eligibility-card`) | highlighted clause, amber |
| b19 | "Then Gemini drafts the email with the right context." | **`/claims/[id]` → `ClaimDetailShell`** | headline 3-pane; Draft=Email Draft, Preview tab |
| b20 | "Ask for a warmer tone, and it rewrites it." | `/claims/[id]` **Assistant pane** "Make it friendlier" quick action | real chip label exact |
| b21 | "Seconds later, the new version is ready to review." | `/claims/[id]` Draft version dropdown ("v2 · Assistant rewrite") + regenerating overlay | cross-pane redraft |
| b22 | "Or make a quick edit yourself." | `/claims/[id]` Draft **Edit tab** (Textarea, font-mono) | plain textarea, not rich text |
| b23 | "Your wording, saved as a fresh draft." | `/claims/[id]` Draft version → "v3 · You edited" | "Save changes" → new version |
| b24 | "Review it once, then approve." | `/claims/[id]` full shell + `ClaimHeader` "Approve and send" | actions live in sticky header |
| b25 | "ClaimIt sends the claim. You stay focused." | `/claims/[id]` `ClaimHeader` Approve + `approve-confirm-dialog` | green = reclaimed-money only; approve button itself is primary navy in real header |
| b26 | "A banner confirms it — sent from your own Gmail." | `/claims/[id]` `post-approve-banner` + `sonner` toast | **no standalone SentBanner** (§7.8) |
| b27 | "Every claim, tracked from draft to outcome." | **`/claims`** (`ClaimRow` table + `ClaimOutcomeBadge`) | needs full chrome + real status badges |

> **Judgment-call flags for the user (UI that doesn't exist as drawn):** b10 (no surface), b11 (dialog not page), b26 (toast/banner, not a dedicated "Sent" screen). b25's approve button in the real header is **navy primary**, not green — only "Reclaimed $X"/outcome uses green; decide whether the demo's green "Approve & send" is an intentional dramatization.

---

*End of map. This is a read-only audit artifact — no `apps/web`, beat, render, or commit changes were made.*
