# Master Build Spec — All Remaining Beats (v1.0)

> **Purpose**: Autonomous end-to-end build of HOOK light-mode patch + all 31 remaining beats (5-35). User is stepping away; CC runs everything sequentially without human checkpoints, reporting per-batch + final summary at end.
> **Target end state**: 35 mp4s + ~140 still PNGs in `out/`. All using light-mode atmosphere matching `apps/web`. All with universal orange subtitle.
> **Created**: 2026-06-03 · **For**: Claude Opus 4.8 in Claude Code · **Estimated wall-clock**: 4-6 hours

---

## Universal constraints (hold across ALL phases)

- **NO ElevenLabs API calls** — key revoked, would fail. Use existing 35 `vo_b*.mp3` files as-is via `<Audio>`.
- **NO modifications** to: `gen_vo.mjs`, `vo_lines.json`, `vo_lines.ts`, `.env`, `vo_b*.mp3`, `load-fonts.ts`, `src/_archive/`, legacy `src/polish/Subtitle.tsx`, `BEAT_SHEET.md` (except v3.1 already-applied edits — don't re-edit).
- **PROJECT LAW — subtitles always**: every beat has `<BeatSubtitle>` with text matching BEAT_SHEET v3.1 EN column verbatim.
- **Renders**: always include `--timeout=120000` (font load needs it under concurrency).
- **Animations**: frame-driven via `useCurrentFrame()` only. No CSS transitions/keyframes, no setTimeout.
- **Fonts**: Inter only (already loaded).
- **No commits.**
- **Per-phase reports**: after each Phase (1 through 7), write a brief report to chat (path-list + observations). Don't wait for user input — proceed to next Phase. User will read all reports together when they return.
- **STOP** only after Phase 7 final summary.

---

## Phase 1 — HOOK light-mode patch (Batch C v1.1)

Equivalent to the prior `HOOK_LIGHT_MODE_FIX.md` instructions (which you may have already received). If not yet applied:

### 1.A Read `apps/web/src/app/globals.css`

Identify exact body bg and text color values used in production UI. Convert oklch/hsl to hex.

If unreachable, use defaults:
- body bg: `#FAFBFC`
- body text: `#0F1419`

### 1.B Update `polish/tokens.ts` (permitted)

Add light-mode companions, keep dark-mode tokens for legacy:

```ts
colors: {
  bg: {
    dark: "#080C14",       // existing
    light: "<from globals or default>",  // NEW
    surface: "#FFFFFF",    // NEW (card surface)
  },
  text: {
    dark: "<from globals or default>",   // NEW
    muted: "#374151",      // NEW
    light: "#FAFBFC",      // legacy for dark-mode beats
  },
  // brand.primary (navy), semantic.danger (red), neutral.* stay UNCHANGED
}
```

### 1.C Rewrite `polish/HookAtmosphere.tsx`

```
Layer 0: AbsoluteFill bg = colors.bg.light
Layer 1: subtle vignette — center transparent → corners rgba(0,0,0,0.05) (~5% darker)
Layer 2: DROP film grain (looks dirty on light)
Layer 3: DROP scan lines (don't work on light)
```

### 1.D Update Beat01-04 color references

| Was | Becomes |
|---|---|
| `colors.neutral[0]` | `colors.text.dark` |
| `colors.neutral[300] @ 0.9` (b01 line) | `colors.text.dark @ 0.6` |
| `colors.neutral[100] @ 0.94` (b03 caption) | `colors.text.dark @ 0.94` |
| `colors.neutral[500]` (b03 + b04 neutral dots) | `colors.text.muted @ 0.55` |

**Unchanged**: `colors.semantic.danger` (b03 red), `colors.brand.primary` (b04 navy wordmark), `BeatSubtitle` (universal LAW).

### 1.E Re-render b01-b04 mp4s + 4 stills (f000/100/200/290) each

Use `--timeout=120000`. Overwrite v1 files.

### Phase 1 report

Paste tokens.ts diff + 4 new mp4 paths + per-beat still summary.

---

## Phase 2 — Shared shim infrastructure (used by Phases 3-6)

Build reusable React components in `src/shims/` for product-UI surfaces. All take props for content variation, all use the new light-mode tokens.

### 2.A Build these shim components (each one file)

| File | Purpose | Used in beats |
|---|---|---|
| `src/shims/AppShell.tsx` | Sidebar (left) + content (right) wrapper matching apps/web dashboard chrome. Sidebar shows ClaimIt logo + nav items (Dashboard / Claims / Purchases / Assistant). | 7, 11, 24, 27 |
| `src/shims/CardSurface.tsx` | Standard rounded-xl (14px) card with `ring-1 ring-foreground/10` styling. Props: children, padding. | many |
| `src/shims/ReceiptVisual.tsx` | Costco receipt rendering — top: "COSTCO WHOLESALE" header, lines: iPad Air M2, $599.99, member#, date. | 10, 12, 13 |
| `src/shims/UploadCard.tsx` | Dropzone-style upload area, dashed border, icon + "Drag receipt or click to upload" + small badge "or read from Gmail inbox". | 11 |
| `src/shims/OcrFieldsCard.tsx` | Extracted fields list — Merchant, Item, Date, Price — with subtle "extracted" pill indicator per row. | 12, 13, 14 |
| `src/shims/PriceHistoryChart.tsx` | Line chart of price over time; props: dataPoints (array of {date, price}). Use SVG path, draw-on animation via stroke-dashoffset. Highlight the drop point with a red dot. | 16, 17 |
| `src/shims/PolicyBadge.tsx` | "30-day window" / "Costco price adjustment policy" badge. | 18 |
| `src/shims/ClaimShell.tsx` | 3-pane layout: Draft (40%) / Evidence (60%) / Assistant (40%). Simplified — show panel headers + content placeholders. | 19, 20, 21, 22, 23, 24 |
| `src/shims/EmailDraft.tsx` | Email composer view: To / Subject / Body. Body has the Costco refund draft text. | 19, 20, 21, 22, 23 |
| `src/shims/RewriteButton.tsx` | "Make it friendlier" quick action chip. | 20 |
| `src/shims/ApproveButton.tsx` | Large primary button with green accent (`colors.brand.accent` = #1F8C4D — the RECLAIMED MONEY GREEN). This is the ONE place green appears in HOOK/Architecture/Refund (per audit constraint "green = reclaimed money only"). | 24, 25 |
| `src/shims/SentBanner.tsx` | Toast-style banner "Email sent from your Gmail" with checkmark icon and timer. | 26 |
| `src/shims/ClaimsListRow.tsx` | Row in claims list with status badge (Draft / Pending / Resolved). | 27 |
| `src/shims/AgentNode.tsx` | Generic "agent" visual — circle icon + label + optional "thinking..." pulse-dot animation. | 7, 8, 30 |
| `src/shims/MongoNode.tsx` | MongoDB logo + label "MongoDB Atlas" + small data flow lines. | 7, 32 |
| `src/shims/PhoenixNode.tsx` | Phoenix logo (use `phoenix.png` from brandlogos/) + label + small trace lines. | 9, 33 |
| `src/shims/RetailerLogoGrid.tsx` | 26-retailer logo grid for credibility beat. Use available logos (costco, bestbuy, target, macys, dell) for real ones; for the other 21 use simple rounded rect placeholders with abbreviated text. | 28, 29 |
| `src/shims/TechWall.tsx` | Tech stack grid: Gemini ADK / MongoDB Atlas / Arize Phoenix / Cloud Run / Pub/Sub logos. | 34, 35 |

### 2.B Shim styling rules

- All use `colors.text.dark` for text
- All use `colors.bg.surface` (#FFFFFF) for card backgrounds on top of `colors.bg.light` page bg
- All use `rounded-xl` (14px border-radius) for cards
- All use `ring-1 ring-foreground/10` equivalent (`border: 1px solid rgba(15, 20, 25, 0.08)`)
- All animations frame-driven if any
- Inter font, sized per apps/web hierarchy (body 14px, headers 18-32px, hero 48-88px)

### 2.C Quick smoke-test render

After building all shims, render Beat01 still f000 to verify nothing broke from the tokens.ts changes (this should still work since Beat01 doesn't use shims, but it tests the new color tokens).

### Phase 2 report

List of 18 shim files created with one-line purpose each. Any apps/web component you couldn't reproduce — note in report.

---

## Phase 3 — Batch D: ARCHITECTURE (beats 5-9, 30s)

**Concept**: This section is the "system explainer" right after HOOK. Should be diagrammatic — animated icons + connector lines + data labels — NOT full product UI shots (those come in Refund Demo). Light atmosphere (same as HOOK), navy + dark gray + occasional brand colors.

All 5 beats use a shared canvas approach: a horizontal flow diagram that progressively builds left-to-right. Each beat brings in the next node/connector.

### Visual approach for all 5 beats

Use a shared horizontal flow layout:

```
[Inbox/Upload]  →  [Gemini OCR]  →  [MongoDB + Agent]  →  [Draft]  →  [Approve + Phoenix]
   Beat 5            Beat 6            Beat 7              Beat 8        Beat 9
```

By beat 9, the entire flow is on screen. Each beat lights up its node + connector while previous nodes dim slightly (still visible). Use the Gmail / Gemini / MongoDB / Phoenix logos from brandlogos/.

### Per-beat specs

| Beat | VO duration | Frame plan (300f total) |
|---|---|---|
| **b5** "A receipt reaches ClaimIt..." (5.34s) | • f0-15: light atmosphere fade-in<br>• f15-30: Inbox icon (Gmail logo) appears left-third, scale 0→1, easeOut<br>• f30-45: Upload icon (Lucide Upload) appears next to it, "OR" between them<br>• f45-260: hold with subtle breath<br>• f260-290: subtle scale-back to make room for beat 6 connector to enter<br>• VO at f6, Subtitle f6-326 |
| **b6** "Gemini reads it..." (5.34s) | • f0-5: prev state continuity<br>• f5-25: animated arrow draws from inbox→Gemini node (stroke draw-on)<br>• f15-40: Gemini logo node appears (use googlegemini.svg) with label "Gemini multimodal"<br>• f40-100: 4 field chips lift out of the Gemini node — "Merchant", "Item", "Date", "Price" — stagger 8f each, fade+slide-up<br>• f100-270: hold<br>• f270-290: subtle compaction<br>• VO at f10, Subtitle f10-330 |
| **b7** "It's stored in MongoDB, and an agent watches..." (4.92s) | • f0-5: prev<br>• f5-25: arrow Gemini→MongoDB node<br>• f15-40: MongoDB logo node (use mongodb.svg) with label "MongoDB Atlas"<br>• f40-80: small agent icon (use Lucide Bot or custom) appears next to MongoDB, with pulse-dot showing "monitoring"<br>• f80-120: clock/calendar icon appears below agent — "every 15 min" badge<br>• f120-260: hold with agent breath (scale 1→1.02→1, 2.8s cycle)<br>• VO at f6, Subtitle f6-301 |
| **b8** "When a drop clears the policy, the agent drafts..." (4.37s) | • f0-5: prev<br>• f5-25: red price-drop indicator pulses on the monitoring icon (uses semantic.danger)<br>• f25-50: arrow draws Agent→Draft node<br>• f30-60: Draft document icon appears with envelope (Lucide FileText or Mail)<br>• f60-90: text content "lifts in" — short typewriter showing "Dear Costco..."<br>• f90-260: hold<br>• VO at f6, Subtitle f6-268 |
| **b9** "You approve it — and every decision, tool call, and draft is traced." (4.97s) | • f0-5: prev<br>• f5-25: small "approve" thumbs-up icon appears next to draft<br>• f25-50: arrow draws Draft→Phoenix node<br>• f30-60: Phoenix logo node appears (phoenix.png) with label "Phoenix tracing"<br>• f60-120: animated trace lines emanate from Phoenix node back to ALL previous nodes (drawing connections backward to show "tracing the whole flow")<br>• f120-270: hold with subtle breathing<br>• f270-290: fade out (next section starts in Refund Demo)<br>• VO at f6, Subtitle f6-304 |

### Audio + Subtitle per beat

```tsx
// b5 example:
<Sequence from={6}>
  <Audio src={staticFile('audio/vo/vo_b05.mp3')} />
</Sequence>
<BeatSubtitle
  text="A receipt reaches ClaimIt — forwarded from your inbox, or uploaded by hand."
  fromFrame={6}
  durationFrames={320}  // 5.34s = 320f
/>
```

Subtitle text MUST match BEAT_SHEET v3.1 EN column verbatim.

### Beat naming + paths

```
src/beats/b05_arch-receipt__020-026/Beat05.tsx
src/beats/b06_arch-extract__026-032/Beat06.tsx
src/beats/b07_arch-monitor__032-038/Beat07.tsx
src/beats/b08_arch-draft__038-044/Beat08.tsx
src/beats/b09_arch-trace__044-050/Beat09.tsx
```

Each 300f @ 60fps. Register all 5 in Root.tsx.

### Phase 3 render

Render 5 mp4s + 4 stills each (f000/f100/f200/f290) with `--timeout=120000`.

### Phase 3 report

5 mp4 paths + 20 still paths + iteration notes + any spec interpretations.

---

## Phase 4 — Batch E: REFUND DEMO (beats 10-27, 90s)

**The biggest section. 18 beats. Show the real Costco refund flow.**

**Visual approach**: Use the shim components from Phase 2. Each beat shows a moment of actual product flow. Camera-like transitions via subtle scale + opacity. NOT a real screen recording — these are Remotion-built shims that LOOK like apps/web.

### Scene structure

| Scene | Beats | Frame total | What's on screen |
|---|---|---|---|
| Scene 1: Input | 10-13 | 4×300 = 1200f | Receipt → Upload → OCR Fields extraction |
| Scene 2: Field check | 14 | 300f | Editable fields (confirm details) |
| Scene 3: Background watch | 15-16 | 2×300 = 600f | Dashboard with price chart over time |
| Scene 4: Detection + policy | 17-18 | 2×300 = 600f | Price drop notification + policy badge |
| Scene 5: Draft + rewrite | 19-21 | 3×300 = 900f | ClaimShell with email draft + Make Friendlier interaction |
| Scene 6: Edit + approve | 22-24 | 3×300 = 900f | Manual edit + review + approve interaction |
| Scene 7: Sent + outcome | 25-27 | 3×300 = 900f | Sent banner + claims list bridge to outcomes |

### Per-beat specs

Format: `Beat #` | `VO` (duration) | `Visual concept` | `Key shims` | `Subtitle`

| # | VO | Visual | Shims |
|---|---|---|---|
| b10 | "It starts with a receipt." (1.67s) | Black-to-light fade-in, then a Costco receipt visual settles into center, slight scale-up. | ReceiptVisual |
| b11 | "Upload a photo or a PDF — or let ClaimIt read it from your inbox." (4.64s) | Receipt pulls up, UploadCard slides in below it, the "or Gmail" badge highlights. | UploadCard |
| b12 | "ClaimIt pulls out the details for you." (2.41s) | Scan-line sweep across receipt; OcrFieldsCard slides in from right with empty rows. | ReceiptVisual + OcrFieldsCard |
| b13 | "The merchant, the item, the date, and the price." (3.81s) | 4 rows populate one-by-one in OcrFieldsCard: Costco / iPad Air M2 / 2026-05-22 / $599.99. Each row fade+slide-up stagger 12f. | OcrFieldsCard |
| b14 | "Each value lifted from the receipt — yours to check and correct." (4.27s) | Same fields now show small "edit" pencil icons + "extracted" badges. Subtle cursor hovers over one field. | OcrFieldsCard (editable variant) |
| b15 | "Then it watches the claim window in the background." (2.88s) | Camera pulls back to show AppShell (sidebar visible), Dashboard view, price-watch indicator in the corner with pulse-dot. | AppShell + small monitor indicator |
| b16 | "Days pass, and it keeps checking the price for you." (3.25s) | PriceHistoryChart in center, line stays flat at $599.99 across "Day 1", "Day 5", "Day 9" labels. Subtle frame-driven time-passes visual. | PriceHistoryChart |
| b17 | "When Costco drops the price, ClaimIt catches it." (3.16s) | Same chart, line suddenly drops from $599.99 → $499.99 at "Day 9" with red dot annotation. Notification toast slides in: "Price drop detected at Costco." | PriceHistoryChart |
| b18 | "It checks the policy, so you do not have to." (2.79s) | PolicyBadge animates in: "Costco · 30-day window · price adjustment". Checkmark fades in. | PolicyBadge |
| b19 | "Then Gemini drafts the email with the right context." (3.90s) | Transition to ClaimShell view. EmailDraft pane on left shows draft text typing in (typewriter). To: pricematch@costco.com, Subject: Price adjustment request, Body: drafted text. | ClaimShell + EmailDraft |
| b20 | "Ask for a warmer tone, and it rewrites it." (2.79s) | Cursor moves to "Make it friendlier" button in Assistant pane, button highlights, click animation. | ClaimShell + RewriteButton |
| b21 | "Seconds later, the new version is ready to review." (3.30s) | EmailDraft body content morphs/replaces with friendlier version (cross-fade). "New version" indicator. | ClaimShell + EmailDraft (v2) |
| b22 | "Or make a quick edit yourself." (2.00s) | Cursor moves into the email body, manual text edit — one word changes from "Hello" to "Hi". | ClaimShell + EmailDraft |
| b23 | "Your wording, saved as a fresh draft." (2.60s) | Small "Saved · Draft v3" badge appears below editor. | ClaimShell + draft version badge |
| b24 | "Review it once, then approve." (2.18s) | Camera pulls to show full email + Evidence pane (showing receipt + price chart). | ClaimShell (full) + ApproveButton hint |
| b25 | "ClaimIt sends the claim. You stay focused." (2.93s) | ApproveButton clicked (the GREEN moment — `colors.brand.accent` ONLY here), button fills with green, then transitions away. | ApproveButton |
| b26 | "A banner confirms it — sent from your own Gmail." (3.25s) | SentBanner slides in from top: "Email sent from your Gmail" + checkmark + small Gmail logo. | SentBanner |
| b27 | "Every claim, tracked from draft to outcome." (3.07s) | Transition to claims list view — ClaimsListRow entries with status badges (Sent / Pending / Resolved). Bridge to next section. | AppShell + ClaimsListRow ×3 |

### Subtitle for every beat

Every Refund Demo beat MUST have `<BeatSubtitle>` with the EXACT VO text from BEAT_SHEET v3.1. Sync to VO start with a small lead-in buffer (typically `<Sequence from={f}>` for VO, and `<BeatSubtitle fromFrame={f} durationFrames={vo_duration_frames}>`).

### Beat naming

```
src/beats/b10_refund-receipt-intro__050-055/Beat10.tsx
src/beats/b11_refund-upload__055-060/Beat11.tsx
... (one per beat)
src/beats/b27_refund-bridge__215-220/Beat27.tsx
```

Each 300f, register in Root.tsx.

### Visual style rules (CRITICAL for Refund Demo)

- All beats use the light atmosphere (no dark mode anywhere from now on)
- Cards use `rounded-xl` (14px), 1px border at 8% opacity
- Buttons use `rounded-lg` (10px), Inter weight 500
- GREEN appears ONLY in ApproveButton (b25) and SentBanner's checkmark (b26) — per audit "green = reclaimed money only"
- Navy `colors.brand.primary` for headers / accents
- Body text `colors.text.dark`, muted captions `colors.text.muted`
- Smooth scale/opacity transitions BETWEEN beats (no harsh cuts) — each beat starts at slight scale 0.98 and settles to 1.0 over first 8f

### Phase 4 render

18 mp4s + 4 stills each (= 72 stills). Use `--timeout=120000`. This is the biggest render phase — expect 1.5-2 hours of rendering alone. Render in batches of 4-5 if your shell can do it in parallel; otherwise sequential.

### Phase 4 report

18 mp4 paths, 72 still paths, list of any per-beat ambiguities resolved by judgment, list of shims used per beat.

---

## Phase 5 — Batch F: CREDIBILITY (beats 28-29, 12s)

| # | VO | Visual |
|---|---|---|
| b28 | "We mapped refund policies across twenty-six retailers." (4.09s) | RetailerLogoGrid — 26 retailer cells in a 5×6 grid (with one empty for spacing). Stagger entry left-to-right, top-to-bottom. The 5 we have real logos for (Costco, Best Buy, Target, Macy's, Dell) get full logos; the other 21 get rounded-rect placeholders with abbreviated text. |
| b29 | "Some run on auto-send. Best Buy and Target use a chat script today." (uses STALE 8.50s audio per BEAT_SHEET note) | Same grid, but Costco/Macy's/Dell get a small "auto-send" pill below their logos in green; Best Buy/Target get a "chat script" pill in muted gray. Subtitle uses TRIMMED text per BEAT_SHEET (the audio is the old long version, but per the beat note this is acceptable temporary mismatch). |

**Important for b29**: Subtitle text is the TRIMMED v3.1 version ("Some run on auto-send..."), the audio is the OLD long version (~8.50s in 6s slot). The audio will run into IMPL_PROOF's start. Per BEAT_SHEET note, this is temporarily acceptable. DO NOT try to "fix" by regenerating the audio (API key revoked).

### Phase 5 render

2 mp4s + 4 stills each.

### Phase 5 report

Paths + the b29 stale-audio confirmation note.

---

## Phase 6 — Batch G: IMPLEMENTATION PROOF (beats 30-34, 20s)

This section "proves" the system is real (not a mockup). Show technical depth without re-explaining (Architecture already did that). More iconographic + brief data.

| # | VO | Visual |
|---|---|---|
| b30 | "Under the hood, each claim is an agent workflow." (3.30s) | TechWall starts to materialize — Gemini ADK / MongoDB / Phoenix logos appear in a centered grid. |
| b31 | "Gemini ADK handles reasoning, tools, and draft generation." (4.55s) | Gemini ADK card highlights/scales-up briefly; small "Reasoning →" "Tool call →" "Draft →" labels animate around it. |
| b32 | "MongoDB Atlas holds every claim state, queried through MCP." (4.83s) | MongoDB card highlights; a small data flow visual shows "claim docs" moving in/out + an "MCP" badge on the read direction. |
| b33 | "Phoenix traces each decision, tool call, and draft." (3.81s) | Phoenix card highlights; trace timeline visual underneath: small spans showing decisions/tool-calls/drafts. |
| b34 | "So the workflow is visible, reviewable, and ready to extend." (4.18s) | All 3 cards visible + glow. Subtle 4th placeholder card "extend →" fading in to suggest extensibility. |

### Beat naming

```
src/beats/b30_impl-workflow__152-156/Beat30.tsx
...
src/beats/b34_impl-extend__168-172/Beat34.tsx
```

### Phase 6 render

5 mp4s + 4 stills each.

### Phase 6 report

Paths + observations.

---

## Phase 7 — Batch H: PAYOFF (beat 35, 8s)

| # | VO | Visual |
|---|---|---|
| b35 | "ClaimIt. AI does the paperwork. You approve." (3.67s) | • f0-30: Tech wall from b34 fades.<br>• f30-60: "Powered by Gemini ADK · MongoDB Atlas · Arize Phoenix" line types in.<br>• f60-90: Team names "Erdun · Raj · Will · Chris" appears below in muted text.<br>• f90-120: ClaimIt logo appears center (Inter weight 700, 128px, navy).<br>• f120-460: hold (longer hold — 5+ seconds for final brand impression).<br>• VO at f30. |

Beat duration: 480f @ 60fps = 8 seconds (longer than standard 300f).

### Beat path

```
src/beats/b35_payoff-final__172-180/Beat35.tsx
```

Note: durationInFrames=480 (not 300) — register in Root.tsx with that value.

### Phase 7 render

1 mp4 + 4 stills.

### Phase 7 final summary

Write a final report to chat with:
- Total beats built: 35 (4 HOOK v1.1 + 5 ARCH + 18 REFUND + 2 CRED + 5 IMPL_PROOF + 1 PAYOFF)
- Total mp4s rendered (path list grouped by section)
- Total stills (count)
- Total elapsed time across all phases
- Per-section iterations needed
- Per-section ambiguities resolved by judgment (1-line each)
- Known issues / flags for user review:
  - b29 stale audio (TRIMMED subtitle, OLD audio — acceptable temp mismatch)
  - Any beat where shim quality felt limited
  - Any beat where a visual would benefit from a real apps/web component vs the simplified shim
- Suggested user review order: most critical beats first (b03 hero, b17 detection, b25 approve moment, b35 payoff)

Then STOP.

---

## Final notes

- **Trust your judgment** on visual details I didn't specify (exact button colors, exact icon sizes, exact animation timings). The spec gives you frame plans + concepts; you have the design system audit + apps/web reference. Default to "clean, minimal, light-mode, matches apps/web aesthetic."
- **If something is genuinely blocked** (e.g. a shim needs a piece of info you can't derive from code), do your best, mark with a `// TODO: review` comment in the beat, and continue. Don't stop the autonomous run for non-critical ambiguity. The user will review later.
- **If something is destructively blocked** (e.g. render keeps failing for a fundamental reason), stop AT THE PHASE that broke, report what happened, and let user decide. Don't proceed past a fundamental break.
- **Don't burn unnecessary time on perfection**. Each beat plays for 1-8 seconds. The viewer won't scrutinize. "Good enough + done" > "perfect + half-finished."
