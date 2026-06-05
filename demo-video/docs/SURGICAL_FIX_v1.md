# SURGICAL FIX SPEC v1

Date: 2026-06-03
Scope: 2 phases — fix architecture vocabulary (b5-9), align Refund-demo
visuals with real apps/web (b10-27). Run autonomously.

---

## 0. Hard constraints (READ FIRST)

**DO NOT TOUCH:**
- `b01-b04` HOOK — light mode v1.1, already approved
- `b28-b29` CRED — retailer grid, approved
- `b30-b34` IMPL_PROOF — tech wall + per-tech accents, approved
- `b35` PAYOFF — closing brand frame, approved
- `src/polish/BeatSubtitle.tsx` — PROJECT LAW values hardcoded, locked
- `src/polish/HookAtmosphere.tsx` — light mode atmosphere, locked
- `src/polish/easings.ts` — locked
- `src/polish/tokens.ts` — locked (includes light-mode additions from Phase 1)
- `BEAT_SHEET.md` — subtitle text is LAW, do not edit
- `vo_b*.mp3` audio files — all 35 are FINAL
- `gen_vo.mjs` / `vo_lines.*` / `.env` / `ELEVENLABS_API_KEY` — API key
  REVOKED, do NOT attempt any ElevenLabs call

**NO ElevenLabs calls.** Audio for b29 (stale long version) stays as-is.
If a subtitle/audio mismatch frustrates you, note in report and move on.

**Reordering is NOT part of this spec.** The eventual master compose order
(HOOK → IMPL_PROOF → ARCH → REFUND → CRED → PAYOFF) is decided for Batch I.
This surgical fix only touches per-beat code, not the playback sequence.

---

## 1. Phase A — Architecture rebuild (b5-b9)

**Problem (user feedback):** current ArchFlow shows a generic
"MongoDB Agent" node — that doesn't exist. The real workflow has 3
sub-agents in the data pipeline plus a separate Assistant agent that
answers user questions (NOT in the workflow). CC's current beats
b5-9 are vocabulary-wrong.

### A.1 Discovery (mandatory first step, do not skip)

Before touching code, CC must establish ground truth:

```
view apps/
view apps/ingest-agent/   (or whatever the first agent folder is named)
view each agent folder's README.md or main.py / main.ts
view packages/shared/pubsub/  (for the real event topic names)
view packages/shared/mongodb/ (for the real collections list)
view apps/web/app/dashboard/  (or similar — see if production UI shows a flow)
```

Goal: write a **5-bullet ground-truth summary** at the top of the Phase A
report, before any beat code is touched. The summary covers:

1. Names of the 3 workflow agents (likely investigate / monitor / claim,
   but confirm from source — folder names from apps/ are the source of
   truth, not user description, not this spec)
2. The Assistant agent — what it actually does (Q&A only)
3. Trigger mechanism for each agent (Pub/Sub event subscribed to, or
   Cloud Scheduler cron)
4. What MongoDB collections each agent reads/writes
5. Where Phoenix tracing attaches

If CC discovers the user's vocabulary differs from the actual code
(e.g. user said "investigate" but folder is `ingest-agent`), **use the
code names**, not the user's. Mention the mismatch in the report.

### A.2 ArchFlow component rewrite

Rewrite `src/shims/ArchFlow.tsx` to reflect the discovered architecture:

- **Workflow pipeline** (L→R): the 3 real workflow agents, connected by
  Pub/Sub event arrows labeled with real event names (e.g. `purchase.ingested`,
  `price.dropped`, `claim.drafted` — discover from
  `packages/shared/pubsub/`)
- **MongoDB Atlas** as a state store *below* the pipeline, with arrows
  showing reads/writes from each agent (not in-line as a node)
- **Cloud Scheduler** as a small clock icon connected to the monitor agent
- **Phoenix** as a trace layer beneath, capturing every Gemini call
- **Assistant agent** as a **sidecar to the right**, clearly visually
  separated from the workflow, with a small label "(answers user
  questions — not in the claim workflow)"

litCount API can stay (drives stage-by-stage reveal for b5-9). The
visual is denser than v1, but legible. Use real logos:
`googlegemini.svg`, `mongodb.svg`, `googlepubsub.svg`, `phoenix.png`,
`googlecloud.svg` (for ADK + Cloud Scheduler + Cloud Run).

### A.3 Per-beat updates

For each beat, update the visual to match the discovered architecture.
Subtitle text MUST stay verbatim from BEAT_SHEET v3.1 (it's law):

- **b5 (`arch-receipt`)** — "A receipt reaches ClaimIt — forwarded from
  your inbox, or uploaded by hand." Show: Gmail/Upload → first workflow
  agent (the ingest-or-investigate agent — use code name).
- **b6 (`arch-extract`)** — "Gemini reads it and pulls out the merchant,
  item, date, and price." Show: Gemini extraction inside the first agent;
  fields lift out as chips.
- **b7 (`arch-monitor`)** — "It's stored in MongoDB, and an agent watches
  the price and the claim window." Show: write-arrow into MongoDB Atlas;
  Cloud Scheduler clock pulses; monitor-agent activates with the "every
  15 min" caption.
- **b8 (`arch-draft`)** — "When a drop clears the policy, the agent drafts
  the claim for you." Show: price-drop event fires on the Pub/Sub bus
  with the real event name; claim-agent activates; draft text begins to
  populate.
- **b9 (`arch-trace`)** — "You approve it — and every decision, tool call,
  and draft is traced." Show: user-approval action; Phoenix trace lines
  spanning all 3 workflow agents; Assistant sidecar fades in to the right
  with its "(not in workflow)" label. **This is where the Assistant first
  appears** — important narrative beat.

### A.4 Render

- 5 mp4s + 20 stills (4 per beat: f000/100/200/290)
- Use `--timeout=120000` (font delayRender)
- Validate stills first, then mp4s

### A.5 Phase A report (deliver before starting Phase B)

```
PHASE A REPORT
==============
1. Ground-truth summary (5 bullets from §A.1)
2. ArchFlow vocab mismatch with user spec (if any)
3. 5 mp4 paths + 20 still paths
4. Per-beat 1-line diff from v1 (what changed visually)
5. Any TODO / uncertain bits (mark for user review)
```

Then continue to Phase B without waiting.

---

## 2. Phase B — UI fidelity pass (b10-b27)

**Problem (user feedback):** the Refund demo beats use approximated shim
components (`/shims/ClaimShell.tsx` etc.) instead of the real apps/web
components. Erdun built a working 3-panel ClaimShell already — CC built
a flat 3-column version that doesn't match. Same applies to other
surfaces.

### B.1 Per-beat discovery loop

For each beat in b10-b27, repeat this workflow:

```
1. Read the beat file: src/beats/b{NN}_*/Beat{NN}.tsx
2. Identify what UI surface it renders (Upload? OCR fields? Dashboard?
   3-panel claim? Email draft? Approve button? Sent banner? Claims list?)
3. Search apps/web for the equivalent component:
   - grep -r "ClaimShell\|EmailDraft\|UploadCard" apps/web/
   - view apps/web/app/  (look at routes — claims, purchases, dashboard)
   - view apps/web/components/  (look at component library)
4. Make a decision (record it):
   (a) REAL → import the real component directly, use it in the beat
   (b) ADAPTED → keep the shim, but update its visuals (colors, layout,
       spacing, font) to match the real component's design
   (c) SHIM → real component doesn't exist or is too coupled to Next.js
       runtime (server components, db calls, etc.); keep shim as-is
5. If decision is REAL or ADAPTED, update the beat
```

**Critical mapping (already known):**

- **b19-b24** ClaimShell → **REAL** (use Erdun's 3-panel component;
  search `apps/web/app/claims/` and `apps/web/components/` for it).
  This is the headline UI surface of the demo — must be the real thing.

**Known candidates to search** (CC verifies each):

| Beat range | Surface | Likely search target |
|---|---|---|
| b11 | Upload dropzone | `apps/web/app/upload`, `UploadCard` / `Dropzone` |
| b12-14 | OCR fields | `apps/web/app/purchases/.../extract`, `OcrFields` / `ExtractedFields` |
| b15, b27 | Dashboard chrome + claims list | `apps/web/app/dashboard`, `apps/web/app/claims`, `Sidebar`, `ClaimsList` / `ClaimRow` |
| b16-17 | Price history chart | `apps/web/app/claims/[id]`, `PriceChart` / `PriceHistory` (real one is recharts) |
| b18 | Policy badge | `PolicyBadge` (might just be a span+icon — shim probably fine) |
| **b19-24** | **3-panel ClaimShell** | **`ClaimShell` / `ClaimReview` / `apps/web/app/claims/[id]/page.tsx` — REAL component required, NOT shim** |
| b25 | Approve button | `ApproveButton` / `SubmitClaim` / shadcn `Button` with green variant |
| b26 | Sent banner | toast component — apps/web likely uses `sonner` or `react-hot-toast` |

### B.2 Real-component import — caveats

When importing a real apps/web component into a Remotion beat, CC may
hit issues:

- **Server components** ("use server" or no "use client") — won't run
  in Remotion's client-side Chrome. Fall back to ADAPTED (rebuild
  the visual with the real styling) or SHIM (note why).
- **Data fetching hooks** (useSWR, server actions, db.query in
  effect) — strip them out for the Remotion version; pass data as props.
- **Next.js Image** (`next/image`) — incompatible with Remotion. Replace
  with Remotion's `<Img>` from `remotion`.
- **Next.js Link** — strip, use plain `<a>` or static div.
- **`'use client'` directive** — fine for Remotion (it's a client renderer
  anyway), but verify hooks don't reach for `window` outside useEffect.
- **CSS modules / Tailwind classes** — fine if apps/web's Tailwind config
  is set up; otherwise extract inline styles.

**Rule:** if importing creates >30 min of yak-shaving, fall back to
ADAPTED and use the real component as a *visual reference*, not a direct
import. Note this in the report.

### B.3 Conservative principle

The goal is **visual fidelity to apps/web**, not pixel-perfect
component reuse. The user will judge whether each beat *looks* like
the real product. If the shim is updated to match real colors / spacing
/ font / iconography, that's acceptable. If the shim is wildly off, it's
not.

Pick the path that gets the beat to "looks like the real app" fastest.

### B.4 Render

Only re-render beats that changed. For each changed beat:
- 4 stills (f000/100/200/290)
- 1 mp4 with `--timeout=120000`

Beats that stay shim-as-is with no visual change don't need re-rendering.

### B.5 Phase B report (deliver and STOP)

```
PHASE B REPORT
==============
1. Per-beat decision table:

   | Beat | Surface | apps/web file found | Decision | Notes |
   |------|---------|---------------------|----------|-------|
   | b10  | Receipt | (none — physical)    | SHIM     | no real surface |
   | b11  | Upload  | apps/web/...        | REAL/ADAPTED/SHIM | ... |
   | ...  | ...     | ...                 | ...      | ...   |
   | b19  | ClaimShell | apps/web/.../page.tsx | REAL (Erdun's) | ... |
   | ...  | ...     | ...                 | ...      | ...   |

2. Mp4 paths re-rendered (only those that changed)
3. Beats that stayed shim — reason for each
4. Anything CC couldn't import — what + why + fallback used
5. Any TODO / uncertain bits (mark for user review)
```

Then STOP. Do not continue to master compose / Batch I.

---

## 3. Process rules

- **Phase A finishes BEFORE Phase B starts.** Architecture vocab affects
  user's mental model; UI fidelity is independent.
- **Report after each phase**, then keep going without waiting for user.
- **No git commits.** User reviews and commits manually after the run.
- **Forbidden patterns** (same as previous spec): no `transition:`,
  `@keyframes`, `setTimeout`, `setInterval`, `requestAnimationFrame`,
  `<img>` (use `<Img>` from remotion), no hex literals in beat files
  (use tokens), no `localStorage`. All movement via `useCurrentFrame`.
- **Background renders OK** — if there's a long render queue, kick it
  off in the background and continue writing code (this worked well in
  the master build).
- **All beats keep `<Audio>` + `<BeatSubtitle>`** — even if visuals change,
  the audio and subtitle layer must remain present and unchanged.

---

## 4. Estimated scope

- Phase A: ~5 beat rewrites + 1 ArchFlow rewrite + 5 mp4 renders. ~1.5h.
- Phase B: 18 discovery loops + estimated 6-10 beat rewrites + 6-10 mp4
  re-renders. ~2.5-3h.
- Total: 4-5h autonomous.

User is stepping away again. Phase A and B both autonomous. Stop after
Phase B summary.
