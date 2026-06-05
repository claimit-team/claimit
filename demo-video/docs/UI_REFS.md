# UI References — v2 visual audit

Rendered: 2026-06-03
Status: **PENDING USER AUDIT**
Render spec: PNG stills, frame 0, 1920×1080 (lossless). Output: `demo-video/remotion/out/uirefs/`.
Source components: `src/uirefs/` (registered as `ui-<name>` Compositions in `Root.tsx`).
Re-render one: `npx remotion still src/index.ts ui-<name> out/uirefs/<name>.png --frame=0 --timeout=120000`

## How these were built (read before auditing)

- **Tokens/classes are the real ones.** The Remotion `src/globals.css` does `@import "../../../apps/web/src/app/globals.css"` + `@source "../../../apps/web/src"` + `@source "./"`, so Tailwind v4 resolves the **same** ClaimIt tokens (`--brand-primary-*`, `--neutral-*`, `--semantic-*`, `--primary` oklch, radii) and generates every utility my uirefs use. `className` strings are copied **verbatim** from the apps/web components.
- **Every surface is a visual REBUILD, not a real import.** The production components can't be imported into Remotion (the `@/` path alias, base-ui client runtime, zustand stores, SSE/data hooks, `next/link`, `react-resizable-panels`). So each surface re-implements the markup with the real classes. **`lucide-react` and `recharts` ARE the real libraries** (same versions as apps/web), so icons and the price chart are genuine, not redrawn.
- **Chrome is verbatim** on all 10: 256px sidebar with the real groups (Main → Dashboard/Claims/Purchases · Assistant → Assistant/Notifications · Actions → Upload receipt · Settings/Help · "ClaimIt Beta v1.0") + 64px top header (theme toggle, Bell, JD avatar). Responsive `lg:` prefixes resolved to desktop. FAB shown where production shows it (dashboard/claims/purchases/confirm), hidden on claim-detail (`fabHidden`).
- **Data** is hard-coded from `packages/shared/fixtures/{purchase,claim,price_history}.costco.json`.

## Surfaces

### 1. app-shell-empty
- **Image:** out/uirefs/app-shell-empty.png
- **Based on:** `app/(authenticated)/layout.tsx` (AuthenticatedShell) + `dashboard/page.tsx` "new" state + `dashboard/hero/new-user.tsx`
- **Built:** chrome + `HeroNewUser` (verbatim) — production renders ONLY the page header + new-user hero in the empty state.
- **Demo beats:** baseline chrome reference
- **Notes:** Pure-chrome reference. Dashed "Browse files" dropzone + "Or connect Gmail →".

### 2. dashboard-loaded
- **Image:** out/uirefs/dashboard-loaded.png
- **Based on:** `dashboard/page.tsx` (active state) + `dashboard/hero/active-user.tsx`
- **Built:** PageHeader (verbatim) + `HeroActiveUser` (verbatim) + Needs-attention + Monitored-purchases sections.
- **Demo beats:** b15 (watch)
- **Notes:** Needs-attention card + monitored-purchases row are **reconstructed from the design system** — the section bodies in `dashboard/page.tsx` (L603–840) weren't transcribed. Hero counts ("2 claims · 1 purchase") are representative.

### 3. claims-list
- **Image:** out/uirefs/claims-list.png
- **Based on:** `app/(authenticated)/claims/page.tsx` (ClaimRow table) + `claims/claim-outcome-badge.tsx` + `claims/platform-logo.tsx`
- **Built:** verbatim — h1/subtitle, filter chips (All active), search, desktop table.
- **Demo beats:** b27 (claims bridge)
- **Notes:** Costco iPad is the only real fixture; Best Buy / Target / Amazon rows are representative variety rows (user-requested "1 draft + 1 sent + 1 resolved" + 1 denied). Outcome badges use the real color map (amber/blue/green/red).

### 4. claimshell-loaded
- **Image:** out/uirefs/claimshell-loaded.png
- **Based on:** `claims/claim-detail-shell.tsx` + `claim-header.tsx` + `draft-pane.tsx` + `evidence-pane.tsx` + `assistant-pane.tsx`
- **Built:** 3-pane **Draft 40% | Evidence 60% / Assistant 40%** (resizable-panels defaults). Draft v1 (AI draft), Preview tab, empty Assistant (quick-actions only), NAVY "Approve and send" in the sticky ClaimHeader.
- **Demo beats:** b19
- **Notes:** Default pre-rewrite state (1 version). Email "To:" row omitted (see flags). Evidence screenshot is representative (see flags).

### 5. claimshell-assistant-active
- **Image:** out/uirefs/claimshell-assistant-active.png
- **Based on:** same as #4 + `assistant-pane.tsx` message bubbles
- **Built:** Assistant 2-turn exchange (user "Make it friendlier" → assistant confirms v2 + `Tools · request_redraft` + "View trace"). Draft dropdown auto-switched to **v2 · Assistant rewrite**, showing the friendlier draft.
- **Demo beats:** b20, b21
- **Notes:** Assistant response text is representative LLM output (the kind production streams); tool badge + trace link are real UI elements.

### 6. claimshell-approved-state
- **Image:** out/uirefs/claimshell-approved-state.png
- **Based on:** same shell + `claims/post-approve-banner.tsx`; header `submitted` branch
- **Built:** post-approve = status **Submitted**: `PostApproveBanner` ("**Submitted** — sending from your Gmail.") + header record-outcome actions ("Approved / refunded" + "Denied").
- **Demo beats:** b25
- **Notes:** Production does NOT keep a disabled "Approve" button post-click — it transitions to the submitted state shown here (banner + outcome actions). Flagged for audit.

### 7. upload-modal-on-dashboard
- **Image:** out/uirefs/upload-modal-on-dashboard.png
- **Based on:** `upload/upload-dialog.tsx` (empty dropzone) over `dashboard/page.tsx`
- **Built:** `UploadDialog` centered (max-w-lg) over the loaded dashboard with the **real light `bg-black/10` backdrop** (not a dark scrim). Dropzone empty state ("Drag a receipt here" / "Browse files"), footer Cancel + disabled "Upload receipt".
- **Demo beats:** b11
- **Notes:** Upload is a global modal, NOT a `/upload` page. No "read from Gmail" option in the dialog (that affordance is only on the new-user hero).

### 8. ocr-fields-populated
- **Image:** out/uirefs/ocr-fields-populated.png
- **Based on:** `app/(authenticated)/confirm/[purchaseId]` → `confirm/confirm-purchase-content.tsx` + `confirm/extraction-review-form.tsx`
- **Built:** **VERDICT: OCR fields are shown on the `/confirm` route, NOT the upload dialog** (the dialog `router.push('/confirm/…')` on success). 2-column: receipt preview (left) + extraction form (right) with Costco fields populated — Platform "Costco", Product "Apple iPad Air 11-inch (M2, 128GB, Wi-Fi)", Price $599.99, Date May 22 2026, Order 1185402639, Category Retail.
- **Demo beats:** b12, b13, b14
- **Notes:** See flags re: Platform="Costco" (real enum gap). Receipt preview + ActionBar reconstructed (those child components weren't transcribed in full).

### 9. purchase-detail-with-chart
- **Image:** out/uirefs/purchase-detail-with-chart.png
- **Based on:** `purchase/purchase-detail-content.tsx` + `purchase-page-header.tsx` + `price-history-chart.tsx` (recharts) + `refund-eligibility-card.tsx`
- **Built:** `max-w-[960px]` stacked: purchase header (logo + title + "Eligible drop" badge + meta) → **real recharts** price-history chart (monotone neutral-500 line, dashed "Paid $599.99" ReferenceLine, amber drop dot on May 31, Highest/Lowest/Current stat column) → refund-eligibility (window progress + policy).
- **Demo beats:** b16, b17, b18 (chart lives on `/purchases/[id]`, NOT claim detail)
- **Notes:** Price series synthesized (fixture has 1 snapshot) — see flags. `isAnimationActive={false}` so the line is fully drawn at frame 0.

### 10. sent-confirmation
- **Image:** out/uirefs/sent-confirmation.png
- **Based on:** submitted ClaimShell + `post-approve-banner.tsx` + sonner toast (`ApproveConfirmDialog` `toast.success`)
- **Built:** the submitted ClaimShell (banner visible) with a **sonner toast at its default bottom-right position** reading "Claim approved".
- **Demo beats:** b26
- **Notes:** Toast text is the **real** `toast.success("Claim approved")` string — NOT the v2-spec's guessed "Email sent from your Gmail" (that copy is the banner's "— sending from your Gmail").

## Audit flags — deliberate fidelity calls (please verify against your live app)

1. **Approve button = real `bg-primary` (oklch 0.205 0 0 ≈ near-black), not literal navy, not green.** apps/web's `--primary` is the shadcn near-black token; it is NOT overridden to the brand navy. Your "NAVY (not green)" instruction is honored in spirit (normal dark primary, green reserved for resolved outcomes). If your live app shows a bluer navy, the token differs from what I read — flag it.
2. **#8 Platform shows "Costco".** `extraction-review-form.tsx` documents a LATENT DATA MISMATCH: the `Platform` enum carries only 10 values and Costco isn't one yet, so in today's prod a Costco upload arrives with `platform=""` (empty select). I rendered the **intended** state ("Costco") per your "Merchant: Costco" instruction; the enum-widening is a known follow-up.
3. **Email "To:" row is hidden** (Subject only). The policy fixtures carry `claim_email: null` (e.g. best_buy sample), so the real `EmailDraft` hides the To row — no address fabricated.
4. **No Costco policy fixture exists**, so the evidence "Read Costco policy" link + "Policy verified May 1, 2026" use representative Costco values (mirroring the best_buy sample's shape).
5. **Evidence price-drop screenshot is representative** (a styled costco.com PDP). The real `EvidencePane` fetches a blob via the api-gateway proxy — unavailable in a static render.
6. **Price-history series is synthesized** (flat $599.99 → $499.99 drop on May 31). `price_history.costco.json` is a single snapshot; a real monitored series would carry the flat-then-drop shape shown.
7. **Reconstructed (not transcribed) bits:** dashboard needs-attention + monitored cards; confirm receipt-preview + ActionBar. Built from the design system; refine on audit.
8. Resize-handle grips simplified to the hairline pane dividers (the real `ResizableHandle withHandle` adds a center grip).

## Real-import vs rebuilt summary
- **Real apps/web component import:** 0/10 (not viable — see "How these were built").
- **Rebuilt with real tokens/classes + real lucide/recharts:** 10/10.
- **Skipped:** 0/10.
