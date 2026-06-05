# UI INTEGRATION AUDIT v2 (Visual)

Date: 2026-06-03
Supersedes: UI_INTEGRATION_AUDIT_v1.md (text-based markdown audit)
Purpose: **Visual** audit of CC's understanding of apps/web's integrated
UI. CC builds Remotion components that compose the real product UI, renders
them as PNG stills, and the user visually compares each rendered still
against apps/web running locally. Iterates until each surface is
approved.

After approval, these rendered surfaces become the **canonical UI
references** (`src/uirefs/`) that future beats import from instead of the
hand-rolled `src/shims/`.

---

## 0. Why visual audit (vs. text)

Markdown descriptions of UI ("sidebar has 4 nav items in this order with
this active state styling") are slow to read, slow to write, and easy to
mis-interpret on both sides. A single rendered PNG either matches reality
or it doesn't — the user can spot wrong in 2 seconds. Iteration is
cheaper too: CC fixes the offending component, re-renders one PNG.

This also produces an asset that's directly **reusable** — the validated
uiref components become the real building blocks of beats b10-b27.

---

## 1. Hard rules

- **NO beat code changes** under `src/beats/`
- **NO edits to apps/web** (read-only)
- **NO edits to existing shims** under `src/shims/` (keep them; beats
  still use them until uirefs are approved)
- **NO renders of any beats** — only the new uiref compositions
- **NO commits, NO ElevenLabs**
- New files only:
  - `src/uirefs/<Name>.tsx` (one React component per UI surface)
  - `src/uirefs/index.ts` (re-exports)
  - Register each as a Composition in `Root.tsx` under a new `UI` section
  - Output PNGs: `out/uirefs/<name>.png`
  - Index doc: `demo-video/docs/UI_REFS.md`

---

## 2. The UI surfaces to render

CC builds these surfaces. The list is a starting point — CC may add 1-2
more if apps/web has obviously-needed UI not listed here, or skip 1-2 if
they don't exist in apps/web yet (note in the index).

| # | Surface name | What it shows | Demo beats that will use it |
|---|---|---|---|
| 1 | `app-shell-empty` | Authenticated chrome only (sidebar + topbar + empty content area) | baseline reference |
| 2 | `dashboard-loaded` | Dashboard with stats row + recent claims list | b15, b27 |
| 3 | `claims-list` | Claims list page with multiple status rows + filters | b27 (alt) |
| 4 | `claimshell-loaded` | The 3-panel claim review with Costco iPad fixture loaded (draft text in left, evidence in center, Assistant chat history in right) | b19, b22, b23 |
| 5 | `claimshell-assistant-active` | Same as #4 but Assistant has just sent a message + user typing | b20, b21 |
| 6 | `claimshell-approved-state` | Same shell but with Approve button highlighted / sending | b25 |
| 7 | `upload-dropzone` | Upload page with dropzone visible + "or read from Gmail" option | b11 |
| 8 | `ocr-fields-populated` | OCR extraction page with all 4 fields filled (Merchant / Item / Date / Price) for Costco iPad | b13, b14 |
| 9 | `claim-detail-with-chart` | Claim detail page showing price history chart with drop + policy badge | b16-b18 |
| 10 | `sent-confirmation` | Toast/banner "Email sent from your Gmail" overlaying the ClaimShell | b26 |

All surfaces use the **Costco iPad Air M2** fixture (purchase.costco.json
+ claim.costco.json) for consistency across the demo.

---

## 3. Build protocol — per surface

For each surface above:

```
1. Identify which apps/web route/page/component implements this surface
2. view that file end-to-end (page.tsx + all imported components)
3. For each imported component, view it too (you cannot fake the
   composition by guessing — read the actual code)
4. Build src/uirefs/<Name>.tsx that:
   - Renders the same layout / chrome / content
   - Uses real logos and tokens (no hex literals; use polish/tokens.ts
     with the light-mode additions from Phase 1)
   - For data: hard-code values from the Costco fixture
     (packages/shared/fixtures/purchase.costco.json + claim.costco.json)
   - Is a SINGLE STATIC FRAME — no animations, no useCurrentFrame
   - Imports the real apps/web component IF it's possible (no Next.js
     Image, no Link, no server components, no useSWR). Otherwise rebuild
     the visual to match — but DOCUMENT WHY in the index (§5)
5. Register as a Composition in Root.tsx:
     <Composition id="ui-<name>" component={<Name>}
       durationInFrames={60} fps={60} width={1920} height={1080} />
6. Render one still at frame 0:
     npx remotion still src/index.ts ui-<name>
       out/uirefs/<name>.png --frame=0 --timeout=120000
```

**Key constraint**: each uiref is a **static composition of the entire
visible page** — sidebar + topbar + content + any overlays. Not an
isolated card on a neutral background. The user must see the integrated
product, exactly as a user would in their browser.

---

## 4. Index markdown

Output to `demo-video/docs/UI_REFS.md`:

```markdown
# UI References — v2 visual audit

Rendered: <date>
Status: PENDING USER AUDIT

## Surfaces

### 1. app-shell-empty
- **Image:** out/uirefs/app-shell-empty.png
- **Based on:** apps/web/app/(authenticated)/layout.tsx
- **Components used:** AppSidebar, SiteHeader (real apps/web imports)
- **Demo beats:** baseline reference (no specific beat)
- **Notes:** —

### 2. dashboard-loaded
- **Image:** out/uirefs/dashboard-loaded.png
- **Based on:** apps/web/app/dashboard/page.tsx
- **Components used:** AppSidebar (real), SiteHeader (real), StatsRow
  (rebuilt — server component, can't import), ClaimsTable (real)
- **Demo beats:** b15, b27
- **Notes:** StatsRow rebuilt because original uses server-side DB
  query for stat values. Visual styling preserved.

[...etc for each]
```

Keep it terse — the PNG is the audit, the markdown is just the index.

---

## 5. Render all at once

Once all uiref components are written:

```bash
mkdir -p out/uirefs
for name in app-shell-empty dashboard-loaded claims-list ... ; do
  npx remotion still src/index.ts ui-$name \
    out/uirefs/$name.png --frame=0 --timeout=120000
done
```

Verify all PNGs landed. Report file paths + sizes.

---

## 6. CC's report after first render

Post to chat:

```
UI REFS v2 — FIRST RENDER COMPLETE
==================================

Surfaces rendered: 10/10 (or X/10 if some skipped)
PNG paths: out/uirefs/*.png
Index: demo-video/docs/UI_REFS.md

Surfaces where real apps/web import succeeded: <list>
Surfaces where apps/web component had to be REBUILT visually: <list + why>
Surfaces SKIPPED (component doesn't exist in apps/web): <list + why>

Awaiting user audit. No further work until verdicts received.
```

Then STOP. Wait for user.

---

## 7. User audit protocol

The user reviews PNGs side-by-side with apps/web running locally
(`pnpm --filter web dev` → http://localhost:3000).

For each surface, user reports one of:

- `✅` — looks right, ship it
- `⚠️ <specific issue>` — close but X is wrong (e.g. "sidebar should be
  280px not 240px"; "missing avatar in topbar"; "ClaimShell middle pane
  is wider than the left pane, you have them equal")
- `❌ <why>` — wrong enough that it needs a real rebuild (e.g. "this
  isn't the dashboard, this is some other page")
- `🆕 <description>` — please add this surface, you missed it

User feedback format:

```
## UI_REFS audit round 1

✅ app-shell-empty
✅ upload-dropzone

⚠️ dashboard-loaded — Sidebar active state should be a blue background
  block (oklch(0.5 0.15 250)), not just bold text. Stats cards have
  border but real ones don't.

⚠️ claimshell-loaded — Right pane (Assistant) is too wide; real is
  about 30%, you have ~40%. Also the Assistant message bubbles should
  have a subtle gradient background, not flat.

❌ claims-list — This looks like the dashboard, not the claims list
  page. Go look at /claims, not /dashboard.

🆕 Need a `claim-detail-no-claim-yet` — when a purchase is being
  monitored but no claim has fired yet. b15 needs this. Look at
  /purchases/[id].
```

---

## 8. Iteration protocol

For each surface flagged `⚠️` / `❌` / `🆕`:

1. Re-read the relevant apps/web file (the audit comment usually points
   at the gap)
2. Modify `src/uirefs/<Name>.tsx`
3. Re-render: `npx remotion still ... out/uirefs/<name>.png --frame=0`
4. Update UI_REFS.md notes

For `🆕`: add a new uiref component + composition + render.

When all surfaces in the round are updated:

```
UI REFS v2 — AUDIT ROUND <N> COMPLETE
=====================================

Surfaces re-rendered: <list>
Surfaces added: <list of 🆕 if any>
Changes per surface: <one-line each>

Awaiting user audit round <N+1>.
```

Then STOP. Wait for next user pass.

---

## 9. Lock-down criteria

When user signs off with:

```
## UI_REFS audit FINAL — ALL APPROVED ✅
```

Then:

- Mark `demo-video/docs/UI_REFS.md` status as `LOCKED <date>`
- The uiref components in `src/uirefs/` become **canonical**
- Future beat rebuilds (Phase B of SURGICAL_FIX) will import FROM
  `src/uirefs/` rather than building from `src/shims/`
- If apps/web ever changes after this lock, user re-runs this audit

---

## 10. Estimated effort

- CC first build of 10 uirefs: 60-90 min
- CC first render pass: 5-10 min
- User round 1 audit: 20-30 min
- CC iteration round 1: 30-45 min
- (Typical: 2-3 iteration rounds to convergence)
- **Total time to lock-down:** 2.5-4 hours, spread over 3-5 sequential
  rounds. Not autonomous — user must be present for each audit pass.

---

## 11. Anti-patterns to avoid

CC should NOT:

- Render only the content area without the sidebar+topbar chrome
  (defeats the purpose of "integration" audit)
- Use placeholder text like "Lorem ipsum" — use the real Costco fixture
- Use placeholder colors / fonts — use polish/tokens.ts values
- Add animations / motion — these are STATIC stills
- Skip surfaces because "they look hard to import" — rebuild them
  visually and document why
- Stack multiple surfaces in one composition — one composition per
  surface
- Render at non-1080p resolution unless user explicitly asks
- Compress PNGs (Remotion stills default to lossless — keep that)

The user should NOT:

- Audit any PNG without apps/web running locally for comparison
- Approve a surface that's "good enough" — every detail should match,
  because this becomes the foundation for 18 demo beats
- Skip the index markdown — the notes there explain WHY each surface
  looks how it does (which informs iteration)

---

## 12. Out of scope (do later, not now)

- Updating beats b10-b27 to use the new uirefs (separate phase, only
  after lock-down)
- The 5% / 12% / 2% statistic decision for HOOK b03
- Architecture rebuild of b5-b9 (SURGICAL_FIX_v1 Phase A — possibly run
  in parallel since it's mostly independent, but easier to do
  sequentially after this is locked)
- Master compose / Batch I
