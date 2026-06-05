# UI INTEGRATION AUDIT v1

Date: 2026-06-03
Purpose: Map the **integrated** UI of apps/web before any demo-video
visual work. Read-only audit — CC produces a single document.
**NO beat code changes, NO renders, NO commits in this task.**

---

## 0. Problem statement (read first)

apps/web is built in fragmented files: `AppSidebar.tsx`, `SiteHeader.tsx`,
`DashboardContent.tsx`, etc. — each in isolation. But the **real UI the
user sees on every page is the COMPOSITION** of these pieces (sidebar +
top bar + content + maybe an Assistant pane).

The demo video must show the *integrated* product, not isolated cards
floating on neutral backgrounds. CC's previous Refund-demo beats (b15
"watch", b19-24 ClaimShell, b27 claims list) used isolated content with
a hand-built shim sidebar, which doesn't match reality.

Before any further UI fidelity work, CC must read apps/web end-to-end and
produce a single document — **UI_INTEGRATION_MAP.md** — that captures
how the pieces actually compose. The user audits that document. Only
after audit passes does the next round of beat rebuild begin.

---

## 1. CC's task — produce UI_INTEGRATION_MAP.md

Output one file: `demo-video/docs/UI_INTEGRATION_MAP.md`.

Required sections (in this order):

### §1 Tech stack & token system

- Framework version (Next.js?, React 18/19?, App Router or Pages Router?)
- Styling system (Tailwind v3/v4? CSS modules? CSS vars?)
- Component library (shadcn/ui? Headless UI? custom?)
- Design tokens — where defined (`globals.css`? `tailwind.config.ts`?
  `apps/web/styles/`?). List the color tokens, font tokens, radius
  tokens, spacing scale.
- Icon library (Lucide React? Heroicons?)
- Form / data libraries (React Hook Form? SWR? React Query?)

### §2 Root + auth layouts

For each layout file (`app/layout.tsx`, `app/(auth)/layout.tsx`,
`app/(authenticated)/layout.tsx`, or whatever exists):

- File path
- What it renders (HTML structure)
- What providers / context wrappers it includes
- What shared chrome (sidebar/topbar) it includes
- Whether it differs by route group

### §3 Shared chrome components

For each shared chrome component (sidebar, header, footer, assistant
floating panel, notification panel, etc.):

- File path
- Approximate dimensions (width / height at desktop default)
- What it contains (nav items, user menu, search, etc.) — list verbatim
- Active state styling (how a selected sidebar item looks)
- Collapse behavior (does sidebar collapse? at what breakpoint?)
- Z-index relative to content

### §4 Page-by-page composition (THE CORE DELIVERABLE)

For **each authenticated route** in apps/web/app/, produce a block:

```
### /<route>

**File:** apps/web/app/<route>/page.tsx

**Layout used:** <layout file path>

**Visual composition (top to bottom, left to right):**
- [Component 1 — file path] — what it shows, approximate dimensions
- [Component 2 — file path] — what it shows
- ... etc

**Page-specific UI elements (not shared chrome):**
- Hero / header strip on this page (if any)
- Main content blocks (cards, tables, forms)
- Empty states / loading states

**Data the page reads:**
- API endpoints called
- Server-component DB queries (if any)

**Relevant to which demo beats:** b15 / b19-24 / b27 / etc.
```

Cover at minimum (the user expects these to exist):

- `/` (landing or redirect)
- `/dashboard` (or whatever the main authenticated home is)
- `/claims` (claims list)
- `/claims/[id]` (the 3-panel ClaimShell — **most critical for demo**)
- `/purchases` (purchases list)
- `/purchases/[id]` (purchase detail)
- `/upload` (or wherever upload happens)
- `/assistant` (full-screen Assistant home, if exists)
- `/notifications`
- `/settings`
- `/onboarding` (or signup flow)
- Anything else discovered

If a route doesn't exist, note it as `MISSING — not yet built in apps/web`.

### §5 The 3-panel ClaimShell (deep dive)

This gets its own section because it's the demo's headline UI.

- File path of the ClaimShell component (search for it — likely in
  `apps/web/components/` or `apps/web/app/claims/[id]/`)
- Exact layout: how are the 3 panes arranged? Fixed widths? Flex
  percentages? Resizable?
- Each pane's contents:
  - Draft pane: editable textarea? Rich text editor (which library)?
    Version history selector?
  - Evidence pane: receipt thumbnail + policy clause + price chart? In
    what order?
  - Assistant pane: full chat history? Single-turn input box? Stream
    indicator?
- Sticky elements (action buttons at bottom? floating Approve?)
- Cross-pane interaction (does the Assistant pane updating trigger a
  re-render of the Draft pane?)

### §6 Component inventory

Flat list of every component file in `apps/web/components/` (or wherever
shared components live):

```
| Component file | Purpose | Used on routes |
|---|---|---|
| AppSidebar.tsx | Left navigation | all authenticated |
| SiteHeader.tsx | Top bar + breadcrumb | all authenticated |
| ... | ... | ... |
```

If there's a UI primitives folder (e.g. `components/ui/` from shadcn),
list it as a single line (`shadcn/ui primitives: Button, Card, Dialog,
Input, ... — used everywhere`).

### §7 Gaps & inconsistencies

Honest section. What CC noticed:

- Routes that exist but pages are stubs (`<div>TODO</div>`)
- Components defined but never imported
- Naming inconsistencies (e.g. ClaimShell vs ClaimReview vs ClaimPanel)
- Server vs client component issues (which ones use `'use server'`?)
- Things that look like they SHOULD exist but don't (e.g. no PriceChart
  component, no SentBanner, etc.)
- Anything that would prevent direct import into Remotion (Next.js Image
  / Link, server components, hooks reaching for `window`)

### §8 Demo beat → apps/web route mapping (for next phase planning)

```
| Beat | Subtitle (verbatim from v3.1) | apps/web route that matches | Notes |
|---|---|---|---|
| b11 | Upload a photo or a PDF... | /upload (or /purchases/new) | ... |
| b15 | Then it watches the claim window... | /dashboard | needs FULL chrome — sidebar + header + content |
| b19 | Then Gemini drafts the email... | /claims/[id] | THE 3-panel ClaimShell |
| ... | ... | ... | ... |
```

Cover b10 through b27.

---

## 2. CC's process

Step-by-step:

```
1. view apps/web/                              (tree, depth 2)
2. view apps/web/package.json                   (stack identification)
3. view apps/web/tailwind.config.ts / .js       (or postcss / CSS approach)
4. view apps/web/app/                           (full app routes tree)
5. view apps/web/app/layout.tsx                 (root layout)
6. view apps/web/app/globals.css                (token system)
7. view apps/web/components/                    (component inventory)
8. For each route under app/, view page.tsx + layout.tsx (if local)
9. For each top-level component file, view + summarize
10. SYNTHESIZE — produce UI_INTEGRATION_MAP.md
```

**Hard rules:**
- No edits to apps/web (read-only)
- No edits to demo-video/remotion/src/ (no beat changes)
- No renders
- No commits
- Output is exactly one file: `demo-video/docs/UI_INTEGRATION_MAP.md`

**Time budget:** 60-90 minutes. apps/web is ~big enough that this needs
real reading, not skim.

**When stuck:** if a route has 200+ lines of nested JSX, summarize at the
component-import level (`uses <ClaimShell> <EvidencePane>...`) rather
than transcribing all JSX. Refer to component files in §3 / §6 instead.

---

## 3. User audit plan (for the user, not CC)

Once CC delivers UI_INTEGRATION_MAP.md, the user audits it. Open the
markdown side-by-side with apps/web running locally.

### Audit checklist

For each section in the map, verify:

**§1 Tech stack**
- [ ] Next.js version matches what's in package.json
- [ ] Tailwind / styling system claim matches reality
- [ ] Token list is complete (no missing color tokens, font tokens)

**§2 Layouts**
- [ ] Every layout.tsx file is documented
- [ ] Provider stack is accurate (Auth provider? Theme provider? etc.)
- [ ] Route group `(auth)` vs `(authenticated)` distinction is captured

**§3 Shared chrome**
- [ ] Sidebar nav items match what's actually in AppSidebar.tsx
  (count + label + order)
- [ ] Sidebar dimensions are right (you can eyeball this in dev tools)
- [ ] Top bar elements are right (does it have search? user menu?
  notifications icon? breadcrumb?)
- [ ] Active-state styling description matches what you see when you
  click nav items
- [ ] FloatingAssistantPanel (if it exists) is captured

**§4 Page-by-page**
- [ ] Every route in apps/web/app/ has a block (no missing routes)
- [ ] For 3-4 randomly picked routes: navigate to the route locally,
  visually compare what you see to CC's "composition" description.
  Check: does sidebar + header + content composition match? Are
  page-specific UI elements all listed?
- [ ] For each route flagged "MISSING": confirm it's actually missing
  (not just CC failing to find it)

**§5 3-panel ClaimShell deep dive**
- [ ] Open `/claims/[id]` (with seeded data) locally
- [ ] Pane widths described correctly? (use dev tools to inspect)
- [ ] Pane contents listed correctly?
- [ ] Editable textarea vs rich text editor — which is it actually?
- [ ] Action buttons (Approve / Cancel / Edit) — where are they?
- [ ] Anything else important not captured?

**§6 Component inventory**
- [ ] Cross-check against `ls apps/web/components/` — anything missing?
- [ ] "Used on routes" column is plausible

**§7 Gaps**
- [ ] Are CC's stated gaps real? (no false alarms)
- [ ] Are there gaps CC missed?
- [ ] Does the gap list explain anything you've been confused about?

**§8 Beat mapping**
- [ ] Every demo beat b10-27 has a row
- [ ] Route assignments look right
- [ ] "Notes" column flags any beat that asks for a UI that doesn't
  exist yet in apps/web (those become judgment calls before Phase B)

### Audit output

The user reports back to me with:

```
## UI_INTEGRATION_MAP audit results

✅ Sections correct: §1, §3, §6
⚠️ Sections with issues:
  - §2: missed `(auth)` layout file at apps/web/app/(auth)/layout.tsx
  - §5: ClaimShell uses recharts not custom SVG
  - §8: b15 should map to /dashboard, not /

❌ Sections requiring full rewrite:
  - §4 /claims/[id] block — composition is wrong, actually uses ...

🔍 Things CC missed:
  - There's a NotificationDrawer.tsx that overlays from the right
  - /onboarding/welcome page exists but isn't documented

❓ Things to clarify:
  - Is the FloatingAssistantPanel always rendered or only on certain pages?
```

Then I take this audit, write a patch spec for CC to fix the map, and
the cycle repeats until the map is clean. Only then do we proceed to the
beat rebuild.

---

## 4. What this unblocks

Once the map is clean and approved:

- **SURGICAL_FIX_v1.md Phase B becomes accurate** — CC has authoritative
  reference for each beat's UI integration
- **Beat shim updates target the right surfaces** — e.g. b15 dashboard
  shim gets the real sidebar nav items + real top bar elements, not a
  guess
- **ClaimShell replacement (b19-24) becomes a concrete swap** — CC
  knows the real component's import path, props, layout, and runtime
  constraints
- **Beats showing missing UI surfaces** (per §7 + §8) get flagged early
  — user can decide whether to build the missing UI in apps/web first
  or render a "designed" version that doesn't exist in production yet

---

## 5. Not in scope (do NOT do in this audit)

- Building any missing apps/web components
- Changing any existing apps/web component
- Editing any beat code under demo-video/remotion/src/
- Running renders
- Updating BEAT_SHEET.md, SURGICAL_FIX_v1.md, or any other spec
- Generating new fixtures or seed data
- Anything to do with audio / ElevenLabs

This is a 100% read + write-one-markdown-file task.
