# ClaimIt Demo — Director-Level SHOT_SPEC v1.0
*Single source of truth. 1920×1080 · 60fps · total 10,800 frames · hard ceiling 3:00.*

---

## PART 0 — EXECUTOR CONTRACT (read first)

1. **Every value here is literal.** No interpretation, no "looks about right." If a value is missing, STOP and ask — do not invent.
2. **Frame model:** 60fps. `frame = seconds × 60`. Each **shot is its own component** rendered on a **local timeline starting at frame 0**. All animation values inside a shot are in **local frames**. The `Timeline.tsx` places each shot at its **global start frame**.
3. **Color discipline (non-negotiable):**
   - `navy #27466E` = primary actions / brand only.
   - `green #1D7A3A` = **money reclaimed only.** It may appear in **exactly 2 places** in the whole film: Shot 12 and Shot 16. Nowhere else.
   - `amber #F59E0B` = price-drop / pending / countdown only.
4. **Motion discipline:** only **two easing curves** exist (see §1.4). No third curve anywhere.
5. **Jitter rules (from capability audit — violating these reintroduces the Breathe bug):**
   - Push-in is **`transform: scale()` only**, on a **dedicated wrapper**, value piped through **`.toFixed(5)`**, `transformOrigin: center`. **Never** combine `scale` with `translate` on the same element.
   - Depth-of-field is **`filter: blur()` on an outer wrapper only**; never nest blur inside a subtree that already has Bloom/Grain.
   - Stage swaps (content changing inside the persistent product window) use **two absolute-inset siblings cross-faded by opacity, both mounted at frame 0**. **Never** use `<Sequence>` or `<TransitionSeries>` for a stage swap.
6. **Numbers:** every dollar figure uses `font-variant-numeric: tabular-nums` and animates **per-digit**, never by scaling the whole element.
7. **Reused real components are NOT restyled.** They render at their native styles/sizes. We frame them with the camera and light them with focus — we never edit their internal CSS.

---

## PART 1 — GLOBAL CONSTANTS

### 1.1 Canvas & timing
- Resolution `1920×1080`, fps `60`, total `10800` frames (180.000 s).
- Background base (dark scenes) `#0A0A0A`; (light scenes) `#F9FAFB`.

### 1.2 Color tokens (hex + role)
| Token | Hex | Role |
|---|---|---|
| `NAVY` | `#27466E` | primary buttons, links, brand |
| `NAVY_HOVER` | `#1C3555` | button hover |
| `NAVY_50` | `#F5F7FA` | "Awaiting Approval" badge bg |
| `GREEN` | `#1D7A3A` | **money reclaimed ONLY** |
| `GREEN_05` | `#EFF8F2` | success tint |
| `AMBER` | `#F59E0B` | price drop / pending / countdown |
| `AMBER_BG` | `#FFFBEB` | policy-quote tint |
| `DANGER` | `#D92626` | "Cancel claim" text only (not used much) |
| `INK` | `#101318` | headings on light |
| `BODY` | `#303845` | secondary body on light |
| `MUTE` | `#6B7280` | muted labels |
| `LINE` | `#E2E6EB` | borders (UI line `#E5E5E5` for resize handle) |
| `N50` | `#F9FAFB` | light bg / email To/Subject box |
| `N100` | `#F0F2F5` | assistant bubble, active tab |
| `WHITE` | `#FFFFFF` | surfaces; primary text on dark |
| `DARK_BG` | `#0A0A0A` | cinematic dark canvas |

### 1.3 Typography
Font: **Inter** (already local in `public/fonts`, weights 400/500/600). `font-feature-settings: "cv11","ss01"`.

**Video display scale (for our own overlay text, NOT reused UI):**
| Style | size / weight / tracking / line-height | use |
|---|---|---|
| `DISPLAY` | 88px / 600 / −2.6px / 0.95 | tagline, hook headline |
| `DISPLAY_S` | 52px / 600 / −1.0px / 1.05 | one-liner, section title |
| `HEADLINE` | 40px / 600 / −0.4px / 1.1 | "Matches the actual claim process…" |
| `STAT` | 160px / 600 / −4px / 1.0 · tabular-nums | "57%", "7%" |
| `MONEY` | 132px / 600 / −3px / 1.0 · tabular-nums | "$50.00" hero |
| `SUB` | 28px / 400 / 0 / 1.4 | sub-lines under headlines |
| `MICRO` | 18px / 500 / 0 / 1.3 | card footer labels, captions |
| `FOOTNOTE` | 14px / 400 / 0 / 1.3 · opacity 0.45 | source citation |

**Reused UI keeps its own scale** (claim shell body 14px, chart ticks 12px, etc.) — never overridden.

### 1.4 Easing (only two)
- `EASE_UI = cubic-bezier(0.16, 1, 0.30, 1)` — all element enter/exit, opacity, typography, focus changes.
- `EASE_CAM = cubic-bezier(0.42, 0, 0.58, 1)` (standard ease-in-out) — camera scale (push-in) only.

### 1.5 The Stage model (the floating product window)
- **Native window** = the real `ClaimDetailShell` region only (NO app sidebar, NO app top bar): `ClaimHeader (~96px) + ResizablePanelGroup`. Native size **1664 × 1016**.
  - Left **Draft** panel **666px**, 1px handle `#E5E5E5`, right column **998px**; right column inner split **Evidence 552px / Assistant 368px** (heights). Pane headers **44px** each.
- **WINDOW_FIT = 0.92** (static scale on the window wrapper) → on-canvas **1531 × 935**, centered at (960,540) → spans x[195–1726], y[72–1008].
- **Window shell shadow** (the "float"): the window's **outer container** gets `box-shadow: 0 24px 60px rgba(20,30,50,0.12)` and `border-radius: 14px` with `overflow:hidden`. The **real cards inside keep their native `ring-1`, no added shadow** (per §0.7).
- **Light backdrop glow** (light scenes): behind the window, one radial gradient, centered (960,500), `radial-gradient(ellipse 1200px 700px, rgba(39,70,110,0.06) 0%, transparent 70%)` over the `#F9FAFB` base. Subtle cool halo, NOT a full-screen gradient.
- **Dark backdrop** (dark scenes): flat `#0A0A0A` + a single directional light (see §1.8).

### 1.6 Camera model
- One outer **camera wrapper** over the stage. **Scale-only.** Default `1.00`.
- Push-in shots ramp camera `1.00 → 1.03` (never beyond 1.05). `transformOrigin: center`, `.toFixed(5)`, `EASE_CAM`.
- **Camera never translates/pans.** Attention is moved by FOCUS (§1.7), not by panning.

### 1.7 Focus model (RackFocus — reuse `src/polish/RackFocus.tsx`)
- A pane/element **in focus**: `blur 0px`, `opacity 1`, `saturate 1`.
- A pane/element **out of focus**: `blur 8px`, `opacity 0.15`, `saturate 0.55`.
- Focus transitions: **400ms (24 frames), `EASE_UI`**.
- Blur is applied on the **wrapper inside** the ResizablePanel (so panel layout math is untouched). Never exceed 12px.

### 1.8 Light & grain
- **Dark-scene light:** one soft directional source from **top-right (≈ 75°)**. Implement as a large radial highlight `radial-gradient(circle 900px at 78% 18%, rgba(255,255,255,0.10) 0%, transparent 60%)`. It **grows** during the Arrival (Shot 4) and **settles** in the Close.
- **Grain:** reuse `src/polish/Grain.tsx`. **Dark scenes: opacity 0.05. Light scenes: grain OFF (0).** (Grain on clean product UI looks like dirt.)
- **Bloom:** only on the dark-scene light source and the Shot-12 green number. Never on reused UI.

### 1.9 Composition grid / safe area
- Title-safe: keep all text within x[160–1760], y[80–1000].
- Overlay text blocks are **horizontally centered (x=960)** unless a shot says otherwise.

### 1.10 Reused component registry
| Logical name | Real path | Props/data source |
|---|---|---|
| `PriceChart` | `apps/web/.../price-history-chart.tsx` | Data Pack §DP-5 |
| `ClaimShell` | `apps/web/.../claim-detail-shell.tsx` | DP-6..DP-9 (email/Sony) |
| `DraftPane(email)` | `draft-pane.tsx` email branch | DP-6 |
| `DraftPane(chat)` | chat_script branch | DP-12 |
| `DraftPane(in_store)` | in_store_guide branch | DP-13 |
| `DraftPane(self_service)` | self_service branch | DP-14 |
| `EvidencePane` | `evidence-pane.tsx` | DP-7 |
| `AssistantPane` | `assistant-pane.tsx` | DP-8 |
- Mock stores/hooks via existing `demo-video/remotion/src/shims/*`. Browser locale forced **en-US** (so dates render English, not Chinese).

---

## PART 2 — TIMELINE MASTER TABLE

| # | Name | Global TC | Global frames | Dur (f) | Act | Canvas | Sound accent (local f) |
|---|---|---|---|---|---|---|---|
| 1 | Cold open | 0:00–0:03 | 0–180 | 180 | I | Dark | — |
| 2 | The things you bought | 0:03–0:12 | 180–720 | 540 | I | Dark | 300 (the drop) |
| 3 | The gap (57/7) | 0:12–0:18 | 720–1080 | 360 | I | Dark | 120, 220 |
| 4 | The light · logo | 0:18–0:28 | 1080–1680 | 600 | II | Dark→Light | 360 (logo lock) |
| 5 | What ClaimIt is | 0:28–0:36 | 1680–2160 | 480 | II | Light | — |
| 6 | Monitor detects | 0:36–0:44 | 2160–2640 | 480 | III | Light | 360 (drop dot) |
| 7 | Into the workspace | 0:44–0:49 | 2640–2940 | 300 | III | Light | 60 (window lands) |
| 8 | The draft writes itself | 0:49–0:59 | 2940–3540 | 600 | III | Light | 480 ($50.00 typed) |
| 9 | The evidence | 0:59–1:07 | 3540–4020 | 480 | III | Light | — |
| 10 | It explains · traceable | 1:07–1:17 | 4020–4620 | 600 | III | Light | 90 (send msg) |
| 11 | You approve | 1:17–1:24 | 4620–5040 | 420 | III | Light | 240 (send click) |
| 12 | The money comes back | 1:24–1:32 | 5040–5520 | 480 | III | Light | 90 (amber→green) |
| 13 | Four ways · I (Email+Chat) | 1:32–1:52 | 5520–6720 | 1200 | III | Light | 120, 660 |
| 14 | Four ways · II (Store+Self) | 1:52–2:11 | 6720–7860 | 1140 | III | Light | 60, 600 |
| 15 | The honest boundary | 2:11–2:30 | 7860–9000 | 1140 | IV | Light→Dark | 120, 480, 840 |
| 16 | Return to the seed | 2:30–2:41 | 9000–9660 | 660 | IV | Dark | 300 (green $50) |
| 17 | Tagline reprise | 2:41–2:52 | 9660–10320 | 660 | IV | Dark | 180 |
| 18 | Sign-off | 2:52–3:00 | 10320–10800 | 480 | IV | Dark | — |

---

## PART 3 — THE 18 SHOT RECIPES

> Schema per shot: **TC/frames · Purpose · Canvas · Layers(z) · Animation(local f) · Camera · Focus · In/Out · Sound · Notes · Data.**

---

### SHOT 01 — Cold open
**TC** 0:00–0:03 · global 0–180 · **local 0–180 (180f)** · Act I · **Dark**
**Purpose:** Silence before the story. Establish the dark world + the single light that will later become ClaimIt.
**Canvas:** `#0A0A0A`. Grain 0.05.
**Layers (z0→z1):**
- z0 Background `#0A0A0A` full frame.
- z1 Directional light (§1.8) at 78%,18%, base opacity **0.04**.
**Animation:** z1 opacity 0.04→0.07 @ f0–180 `EASE_UI` (barely perceptible breath). Nothing else.
**Camera:** static 1.00.
**Focus:** n/a.
**In/Out:** in = from true black (frame 0 is `#000`, lifts to `#0A0A0A` over f0–20). out → **hard match-cut** into Shot 2 (same bg, light continues).
**Sound:** —
**Notes:** No text. Resist adding anything. This 3s of restraint is what makes Shot 2 land.

---

### SHOT 02 — The things you bought
**TC** 0:03–0:12 · global 180–720 · **local 0–540 (540f)** · Act I · **Dark**
**Purpose:** Emotional setup — your purchases, and one of them quietly loses value. The loss is invisible and that's the point.
**Canvas:** `#0A0A0A`, grain 0.05, directional light 0.07.
**Layers (z0→z3):**
- z0 bg + light (continues from S1).
- z1 **Six purchase chips** (DP-1). Each chip: rounded card 360×96, `border-radius:12px`, bg `rgba(255,255,255,0.04)`, `1px solid rgba(255,255,255,0.08)`; product name `SUB` weight 500 `#FFFFFF` opacity 0.92; price `MICRO` `#6B7280` right-aligned, tabular-nums. Positions (center x,y), at depth (for parallax):
  - C1 Sony — (560, 300) depth FAR
  - C2 MacBook — (1320, 250) depth FAR
  - C3 United — (1480, 560) depth MID
  - C4 Hilton — (520, 640) depth MID
  - C5 KitchenAid — (980, 820) depth NEAR
  - C6 Anker — (1180, 760) depth NEAR
- z2 **Headline lines** (overlay, center x=960), `DISPLAY_S` `#FFFFFF`:
  - Line A (y=470): "Every day, the things you buy quietly drop in price."
  - Line B (y=560, appears later): "The difference is yours to claim."
- z3 (none)
**Animation (local f):**
- Chips fade+rise in, **staggered by depth** (FAR first): C1,C2 @ f0–40; C3,C4 @ f20–60; C5,C6 @ f40–80. Each: opacity 0→1, y +24→0, `EASE_UI`.
- **Parallax drift** f0–540: FAR chips drift x −6px, MID −12px, NEAR −20px, linear (slow). (Whole-pixel rounded.)
- Line A: f60–96 opacity 0→1, y+20→0 `EASE_UI`. Hold.
- **The drop (hero beat):** at **f300**, C1 Sony's price changes **$399.99 → $349.99** — old price slides up+fades (12f) while new price slides up from below (12f), new price tint **AMBER** for 18f then settles to `#6B7280`. A 1px amber underline sweeps under C1 left→right over 16f. **C1 lifts +8px and brightens** (border opacity 0.08→0.22) f300–320, holds.
- Line B: f330–366 opacity 0→1 `EASE_UI` (lands just after the drop, naming what just happened).
**Camera:** static 1.00 (parallax does the motion).
**Focus:** at f300, all chips except C1 dim to opacity 0.5 (blur 2px), C1 stays sharp — 20f `EASE_UI`. Restore is NOT needed (shot ends).
**In/Out:** in = match-cut from S1. out → cross-dissolve to S3 over f520–540 (chips + lines fade to 0; light persists).
**Sound:** **f300** = the drop (single soft low tone).
**Notes:** The drop must read as *quiet*, not flashy — no bounce, no flash. Amber tint is the only color. C1 = the seed of the whole film (it returns in Shot 16).
**Data:** DP-1.

---

### SHOT 03 — The gap (57 / 7)
**TC** 0:12–0:18 · global 720–1080 · **local 0–360 (360f)** · Act I · **Dark**
**Purpose:** The hard fact. Make the 57→7 gap *visible*, not just stated.
**Canvas:** `#0A0A0A`, grain 0.05, light 0.07.
**Layers (z0→z2):**
- z0 bg+light.
- z1 **Stat "57%"** `STAT` `#FFFFFF`, anchored center, position (640, 470). Sub under it `SUB` `#6B7280` (640, 580): "of major retailers offer price adjustments".
- z2 **Stat "7%"** `STAT` **`AMBER`**, position (1300, 470). Sub `SUB` `#6B7280` (1300, 580): "of shoppers ever get one".
- z3 **Footnote** `FOOTNOTE` center (960, 980): "Digital Commerce 360 × Bizrate Insights, 2022".
**Animation (local f):**
- "57%" + sub: f0–30 opacity 0→1, y+16→0 `EASE_UI`.
- "7%" + sub: f120–150 opacity 0→1, y+16→0 `EASE_UI`. The number **7%** counts up 0→7 over f120–168 (integer ticks). Held smaller visually (it IS smaller — same STAT size but the *meaning* of the gap is the spacing + the lonely amber).
- Footnote: f200–230 opacity 0→0.45.
**Camera:** very slow push-in **1.000→1.012** f0–360 `EASE_CAM` (almost imperceptible tension).
**Focus:** n/a.
**In/Out:** in = cross-dissolve from S2. out → everything fades to 0 f330–360 EXCEPT we hand off the dark bg+light to Shot 4.
**Sound:** **f120** (7% enters), **f220**.
**Notes:** Leave a wide visual gap between "57%" (left) and "7%" (right) — the empty space between them IS the message. Do not connect them with a line/arrow (too literal).
**Data:** DP-2.

---

### SHOT 04 — The light · logo · tagline
**TC** 0:18–0:28 · global 1080–1680 · **local 0–600 (600f)** · Act II · **Dark → (sets up Light)**
**Purpose:** The turn. The scattered loss converges into a single point of light = ClaimIt. Hope arrives.
**Canvas:** `#0A0A0A` → begins lightening at the very end. Grain 0.05 fading to 0.02.
**Layers (z0→z3):**
- z0 bg.
- z1 **Convergence particles:** ~24 small soft dots (2–4px, `rgba(255,255,255,0.6)`) scattered across frame, that travel toward center (960,470) and extinguish.
- z2 **Light core:** a bloomed point at (960,470) that intensifies as particles arrive.
- z3 **Logo** (ClaimIt shield, navy `#27466E` mark on nothing / white glyph) at (960,440), scale forms from the light core. **Tagline** `DISPLAY` `#FFFFFF` at (960,560): "Your Money, Still Yours."
**Animation (local f):**
- Particles: f0–180 travel to center, opacity 1→0 on arrival, `EASE_UI` staggered.
- Light core: f60–200 bloom radius/opacity grows; peaks at f200.
- **Logo lock:** f200–240 logo resolves (scale 0.6→1.0 `EASE_UI`, opacity 0→1) out of the core. **Tagline letters** reveal f240–300: per-line opacity 0→1 + **letter-spacing −1.0px→−2.6px** (the "focus/snap" — tracking tightens, ties to brand). Hold f300–520.
- **Dark→Light handoff:** f520–600 the background luminance ramps `#0A0A0A → #F9FAFB` (`EASE_UI`), logo/tagline fade out f540–600, the directional light blooms into the full-screen soft halo of §1.5. This is the single "light rises" transition of the film.
**Camera:** static 1.00 (the bloom does the work).
**Focus:** n/a.
**In/Out:** in = from S3 dark. out → **continuous luminance rise** into Shot 5 (no cut; the bg is already light when S5 begins).
**Sound:** **f200–240** = the lock (a single warm swell — the emotional "up").
**Notes:** This is the most important transition in the film. The logo must emerge **from** the gathered light, not just fade in over it. Tracking-tighten on the tagline is mandatory (it rhymes with every other tightened headline).
**Data:** DP-3.

---

### SHOT 05 — What ClaimIt is
**TC** 0:28–0:36 · global 1680–2160 · **local 0–480 (480f)** · Act II · **Light**
**Purpose:** One clean sentence so a judge instantly understands the product before any UI.
**Canvas:** `#F9FAFB` + cool halo (§1.5). Grain OFF.
**Layers:**
- z0 light bg + halo.
- z1 **Two lines**, center x=960, `DISPLAY_S` `#101318`:
  - Line A (y=480): "ClaimIt watches what you buy."
  - Line B (y=560): "When the price drops, it prepares the claim — your way."
  - In Line B, the words **"prepares the claim"** are `#27466E` (navy) — the only color, signaling the core verb (it *prepares*, doesn't *guarantee*).
**Animation (local f):**
- Line A f0–36 opacity 0→1, y+18→0 `EASE_UI`.
- Line B f60–96 same. Navy words fade their color in f96–120 (subtle).
- Hold f120–430. Out f440–480 fade 0.
**Camera:** imperceptible push-in 1.000→1.010 f0–480 `EASE_CAM`.
**Focus:** n/a.
**In/Out:** in = continuous from S4 light rise. out → cross-dissolve to S6 (text gone; the product window fades up in S6).
**Sound:** —
**Notes:** Restraint. No product yet. The navy on "prepares the claim" is the only non-ink color — keep it subtle.
**Data:** DP-4.

---

### SHOT 06 — Monitor detects the drop
**TC** 0:36–0:44 · global 2160–2640 · **local 0–480 (480f)** · Act III · **Light** · *Stage begins*
**Purpose:** Show ClaimIt *finding* the drop, on the real price-history chart.
**Canvas:** `#F9FAFB` + halo. Grain OFF.
**Layers (z0→z2):**
- z0 light bg + halo.
- z1 **Product window** (§1.5 float) containing **`PriceChart`** (DP-5). Window at WINDOW_FIT 0.92, centered. Chart header text: "Best Buy · Sony WH-1000XM5 Headphones" (use the page's real title slot).
- z2 **Monitor caption chip** that appears at the last data point: small pill, bg `WHITE`, `1px LINE`, text `MICRO` `#6B7280`: "Price drop detected by ClaimIt monitor-agent". Positioned just above the final amber dot.
**Animation (local f):**
- Window: f0–24 opacity 0→1, scale 0.985→0.92… *(note: window fades up at its fit scale; the 0.985 is the camera, see Camera)*.
- **Chart line draw (INVENTED — no product animation exists):** the `Line` path uses `stroke-dasharray`/`dashoffset` reveal left→right f24–200, `EASE_UI`. The **amber drop dots** (points < $399.99) pop **after** the line passes each, scale 0→1 (r=6) `EASE_UI`, sequentially f120–210. The dashed **"Paid $399.99"** reference line fades in f40–70.
- Final price reading: a small label at the last point shows **$349.99** appearing f200–220.
- Monitor caption chip: f210–240 opacity 0→1, y+8→0 `EASE_UI`.
- Hold f240–460.
**Camera:** gentle push-in **1.000→1.015** f0–480 `EASE_CAM`.
**Focus:** whole window sharp.
**In/Out:** in = cross-dissolve from S5. out → **STAGE SWAP** to Shot 7: chart layer opacity 1→0 f450–480; (the shell layer of S7 is the same Stage — see Notes).
**Sound:** **f200** (final amber dot / drop reading).
**Notes:** Shots 6–14 share **ONE Stage composition** (`ActIII_Stage.tsx`). The `PriceChart` and `ClaimShell` are **both mounted at frame 0 of Act III**, as absolute-inset siblings, cross-faded by opacity (capability audit rule). The chart's entrance animation is fabricated — the product has none. Keep the line `#6B7280` 2px, dots `AMBER` r=6, exactly per DP-5.
**Data:** DP-5.

---

### SHOT 07 — Into the workspace (push-in #1)
**TC** 0:44–0:49 · global 2640–2940 · **local 0–300 (300f)** · Act III · **Light**
**Purpose:** Transition from "it found it" to "here's the work." Pull the viewer in.
**Canvas:** same light stage.
**Layers:**
- z1 **Product window** content swaps from `PriceChart` (fading out) to **`ClaimShell`** (DP-6..9), fading in. Same window frame, same coordinates.
**Animation (local f):**
- Chart opacity 1→0 f0–30 (tail of S6's swap completes here).
- `ClaimShell` opacity 0→1 f0–48 `EASE_UI`. (Shell was mounted at Act III frame 0 with opacity 0 so `react-resizable-panels` measured layout correctly — never mount it mid-fade.)
- On reveal, the shell shows: ClaimHeader ("Sony WH-1000XM5 Headphones" · "Awaiting Approval" navy badge · "Best Buy · $50.00" · amber clock "8 days remaining"), Draft pane (email), Evidence, Assistant — all at native style.
**Camera:** **push-in 1.015 → 1.030** f0–300 `EASE_CAM` (continues from S6's 1.015, the signature "pull in").
**Focus:** **Draft pane sharp; Evidence + Assistant blur 8px + dim 0.15** — ramp f48–96 `EASE_UI`. (Sets up Shot 8 on the Draft.)
**In/Out:** in = stage swap from S6. out → continuous into S8 (camera holds ~1.03, focus stays on Draft).
**Sound:** **f60** (window/shell settles — a soft "set").
**Notes:** This is one of only **two** push-ins in the film. Camera = scale-only on its wrapper, `.toFixed(5)`. Do NOT pan toward the Draft — focus (blur/dim) does that.
**Data:** DP-6..DP-9.

---

### SHOT 08 — The draft writes itself
**TC** 0:49–0:59 · global 2940–3540 · **local 0–600 (600f)** · Act III · **Light**
**Purpose:** Show the agent producing a real, specific, well-written claim. Plant the "$50.00" beat.
**Canvas:** light stage; Draft sharp, Evidence/Assistant blurred+dim (held from S7).
**Layers:**
- z1 `ClaimShell` → **DraftPane(email)** in focus. To/Subject box (`Subject: Price match refund — Order demo-ord-e273a5c7b4`), then body.
**Animation (local f):**
- **Typewriter** of the email body (DP-6) at **16ms/char ≈ 1 char/frame** (use the production stream cadence: reveal `max(2, ceil((target−current)/40))` chars per frame, but cap so the full body lands by ~f470). Begin f30.
- When the substring **"$50.00"** is typed (≈ f470 by design — tune so it lands here), it **holds 18f** with a 1px amber underline sweeping beneath those 6 chars (f470–488), then continues. This is the plant for Shot 12.
- Subject line types first f30–80; body f90–470; signature "[Your name]" by f500. Hold f500–600.
**Camera:** hold **1.030** (no further push).
**Focus:** unchanged (Draft sharp).
**In/Out:** in = continuous from S7. out → continuous into S9 (focus will shift to Evidence).
**Sound:** **f480** (the "$50.00" plant — a single soft mark).
**Notes:** Use the real DraftPane email renderer; we are only driving its text reveal via the shim. No cursor blink (production has none). The amber underline on "$50.00" is an **overlay** aligned to the glyphs — if glyph-accurate alignment is hard, instead briefly tint the "$50.00" substring amber for 18f (acceptable alternative).
**Data:** DP-6.

---

### SHOT 09 — The evidence
**TC** 0:59–1:07 · global 3540–4020 · **local 0–480 (480f)** · Act III · **Light**
**Purpose:** "This isn't made up." Show proof: price card, monitor screenshot, verified policy, original purchase.
**Canvas:** light stage.
**Layers:**
- z1 `ClaimShell` → **EvidencePane** (DP-7) in focus; Draft + Assistant blurred+dim.
**Animation (local f):**
- **Focus shift** f0–24: Draft → blur 8px/dim 0.15; Evidence → sharp/opacity 1; `EASE_UI`. (RackFocus crossfade.)
- Evidence cards already rendered; we **reveal-emphasize** sequentially by briefly lifting each card's opacity from 0.85→1 as a soft "read" pass: Current-price card f30–60, monitor screenshot f90–120, policy ("Policy verified 2026-05-14") f150–180, original-purchase f210–240. (No layout motion — opacity nudge only.)
- The **−$50.00** figure in the price card is `AMBER` (native). Hold f240–460.
**Camera:** hold 1.030; optional micro-drift 1.030→1.034 f0–480 `EASE_CAM` (keeps it alive).
**Focus:** Evidence sharp; others blur 8px/dim 0.15.
**In/Out:** in = continuous from S8. out → continuous into S10 (focus shifts to Assistant).
**Sound:** —
**Notes:** Do not animate card positions — these are real cards; only opacity emphasis. The amber −$50.00 here is the SAME number that goes green in Shot 12; keep them visually consistent (same size feel).
**Data:** DP-7.

---

### SHOT 10 — It explains, and it's traceable
**TC** 1:07–1:17 · global 4020–4620 · **local 0–600 (600f)** · Act III · **Light**
**Purpose:** The judge beat. The assistant *reasons* about the policy and exposes a verifiable trace.
**Canvas:** light stage.
**Layers:**
- z1 `ClaimShell` → **AssistantPane** (DP-8) in focus; Draft + Evidence blurred+dim.
**Animation (local f):**
- **Focus shift** f0–24 → Assistant sharp.
- **🎯 Claim-focused** badge already visible. A user message bubble "Explain the policy match" appears f60–80 (slide+fade, `EASE_UI`, navy bubble right-aligned).
- **Assistant streams** the reply (DP-8) starting f96, production cadence (16ms, chunked) — full text by ~f430. A `Loader2` spinner shows while streaming (no cursor).
- **Tool line** "Tools · get_reasoning_trace · View trace" fades in f440–470 (`MICRO` muted; "View trace" underlined link color `#6B7280`→hover not needed). Hold f470–600.
**Camera:** hold 1.030.
**Focus:** Assistant sharp; others blur 8px/dim 0.15.
**In/Out:** in = continuous from S9. out → focus widens to full shell for S11 (un-blur Draft+Evidence f570–600).
**Sound:** **f90** (user sends the question — soft tick).
**Notes:** This is the most important *credibility* shot. The streamed text must be the real DP-8 wording (policy match + window expiry June 9). The "View trace" affordance must be visible and legible — it's the proof of Phoenix. Reuse real AssistantPane.
**Data:** DP-8.

---

### SHOT 11 — You approve
**TC** 1:17–1:24 · global 4620–5040 · **local 0–420 (420f)** · Act III · **Light**
**Purpose:** The human is in control. One decisive action, with the honest "from your Gmail" framing.
**Canvas:** light stage; **full shell sharp** (all panes un-blurred, even light).
**Layers:**
- z1 `ClaimShell` (full, sharp).
- z2 **Approve dialog** (DP-9) — appears over a dimmed shell.
- z3 **Cursor** (a simple pointer dot/arrow we control) moving to the button.
**Animation (local f):**
- f0–30: focus returns to full shell (un-blur complete), camera **eases back 1.030→1.000** f0–60 `EASE_CAM` (release the push — we step back to "decide").
- Cursor moves to **"Approve and send"** (navy button, top-right of header) f60–110 (`EASE_UI`, slight slow-in at target). Button hover state at f110 (→ `NAVY_HOVER`).
- **Click** f120: button quick-press (scale 1.0→0.98→1.0 over 8f).
- **Dialog** opens f130–155: shell dims to 0.5 + 2px blur behind; dialog card fades+rises (opacity 0→1, y+12→0, `EASE_UI`). Content = DP-9 ("Send claim email / This will send your price match request to Best Buy from your Gmail…", buttons Cancel · Send email navy).
- Cursor to **"Send email"** f180–230; **click f240**.
- Dialog closes f250–275; shell un-dims; **header badge changes "Awaiting Approval" → "Submitted"** (neutral pill) f270–290; **post-approve banner** appears under header f280–310: "Submitted — sending from your Gmail." (bg `NAVY_50`, text `#27466E`). Hold f310–420.
**Camera:** 1.030→1.000 f0–60, then static 1.000.
**Focus:** full shell sharp throughout (except the dialog's behind-dim).
**In/Out:** in = continuous from S10. out → cut to the **money overlay** of S12 (shell dims hard f400–420 to set up the hero beat).
**Sound:** **f240** (Send email click — a clean, satisfying confirm).
**Notes:** Do NOT actually invoke any send logic — this is a scripted reveal of real UI states via the shim (awaiting → submitted). The "from your Gmail" line is mandatory honesty. The cursor is our own element (not the OS cursor).
**Data:** DP-9.

---

### SHOT 12 — The money comes back (THE HEART)
**TC** 1:24–1:32 · global 5040–5520 · **local 0–480 (480f)** · Act III · **Light**
**Purpose:** The single emotional peak. The abstract "claim" becomes **your $50, back.** The film's only green, only hold.
**Canvas:** light stage, but the shell **dims to near-black** behind the number.
**Layers (z0→z2):**
- z0 `ClaimShell` behind, **dimmed**: opacity 0.10 + blur 10px (ramped in from S11). Background darkens toward `#0E141B` (a near-dark, NOT full black — we're still in the light act, just hushed).
- z1 **Hero number overlay**, center (960,470), `MONEY` (132px): starts as **"−$50.00" `AMBER`** (matching Shot 9's figure), then transforms to **"$50.00" `GREEN #1D7A3A`**.
- z2 **Sub-line** center (960,600), `DISPLAY_S` `#1D7A3A`: "Still yours."
**Animation (local f):**
- Background+shell dim ramp completes f0–30.
- "−$50.00" amber present f0–60.
- **The turn (f60–96):** the leading "−" fades out (10f); the number's color crossfades `AMBER → GREEN` (f72–96, `EASE_UI`); a soft **green bloom** pulses behind the number (radius grows, opacity 0→0.5→0 over f72–120); the number scales **1.00→1.04→1.00** (a single breath, scale-only, `.toFixed(5)`).
- Sub-line "Still yours." f96–126 opacity 0→1, y+14→0 `EASE_UI`.
- **HOLD f126–390** — full stop. Nothing moves for ~4.4s except a 0.5px grain shimmer. This stillness IS the beat.
- Out f390–480: number + sub fade to 0; background lifts back toward light to hand off to Shot 13.
**Camera:** **push-in #2: 1.000→1.030** f0–120, then **lock** (no motion) through the hold. The lock during the hold is critical.
**Focus:** shell dim/blur (background); number perfectly sharp.
**In/Out:** in = hard-ish from S11 (shell dims). out → cross-dissolve / light-lift into S13 (the four-types grid).
**Sound:** **f90** = amber→green turn (the "ka-chunk"/warm resolve — the loudest accent of the film).
**Notes:** This is the payoff of the "$50.00" plant in Shot 8 and the seed in Shot 2. GREEN appears **here and only here + Shot 16**. The 4.4s hold will feel long while editing — keep it; it's the difference between "nice" and "lands." The green bloom is the only Bloom on light-scene content (allowed exception).
**Data:** DP-10.

---

### SHOT 13 — Four ways · I (grid + Email + Chat)
**TC** 1:32–1:52 · global 5520–6720 · **local 0–1200 (1200f)** · Act III · **Light**
**Purpose:** Reveal the real differentiator: ClaimIt produces the *right material for each platform's real process.* Beat 1 covers Email + Chat.
**Canvas:** `#F9FAFB` + halo. Grain OFF.
**Layers (z0→z2):**
- z0 light bg + halo.
- z1 **Top label** center (960, 96), `HEADLINE` `#101318`: "Matches the actual claim process for each platform."
- z2 **2×2 grid of four real cards** (DP-11). Grid area y[170–1010], gaps 32px. Each **card** = framed container (`border-radius:14px`, `box-shadow:0 24px 60px rgba(20,30,50,0.10)`, `overflow:hidden`, bg `WHITE`) ≈ **900×400** holding a **real DraftPane** (the matching type) scaled to fit, plus a 44px card header strip (platform · type) and a footer micro-label bar.
  - **Cell A (top-left): Email · Best Buy** — DraftPane(email) DP-6. Footer `MICRO` `#6B7280`: "ClaimIt sends it from your Gmail."
  - **Cell B (top-right): Chat Script · Amazon** — DraftPane(chat) DP-12. Footer: "ClaimIt writes the script. You run the chat."
  - **Cell C (bottom-left): In-Store · Target** — DraftPane(in_store) DP-13. *(present but dim until Shot 14)*
  - **Cell D (bottom-right): Self-Service · Southwest** — DraftPane(self_service) DP-14. *(present but dim until Shot 14)*
**Animation (local f):**
- Top label f0–36 opacity 0→1, y+16→0 `EASE_UI`.
- Grid assembles: the **Email card** is the Shot-12 subject — it animates from "centered & large" to "top-left cell" via a **cross-fade** (NOT a physical move): a large centered Email card fades out f30–70 while the grid-position Email card fades in f40–90 (avoids scale+translate trap). The other three cells fade in f60–120 (opacity 0→1, scale 0.98→1.00 scale-only, `EASE_UI`), but **C and D held at opacity 0.35 (dim)**.
- **Focus sweep — beat 1:**
  - Email (Cell A) bright/sharp, others dim — f120–360. Footer A fades in f200.
  - Chat (Cell B) becomes bright/sharp; A returns to a "seen" state (opacity 0.85), C/D stay 0.35 — f400–660. Footer B fades in f520. The chat **steps** (real) are visible; optionally the "If the agent declines or stalls" collapse is shown open for 1s f560–620.
- Hold f660–1140; out f1140–1200 (hand the grid to S14, which continues focus on C+D).
**Camera:** static 1.000 (grid is wide; no push).
**Focus:** active cell sharp/opacity 1; inactive bright cells 0.85; not-yet cells 0.35 + blur 3px.
**In/Out:** in = light-lift from S12. out → continuous into S14 (same grid; focus moves to C+D).
**Sound:** **f120** (Email lights), **f660**… wait that's S14. Use **f120** (Email), **f400** (Chat).
**Notes:** All four DraftPanes are the **real renderers** — this is the fidelity showcase. Cells C & D are mounted here (frame 0) at low opacity so they don't reflow when they brighten in S14. Footer micro-labels carry the honesty (who executes) without a spoken claim.
**Data:** DP-11, DP-6, DP-12, DP-13, DP-14.

---

### SHOT 14 — Four ways · II (In-Store + Self-Service)
**TC** 1:52–2:11 · global 6720–7860 · **local 0–1140 (1140f)** · Act III · **Light**
**Purpose:** Complete the four. Land the honest "you execute, ClaimIt prepares" distinction.
**Canvas:** same grid stage (continuous from S13).
**Layers:** same four-card grid (z2); top label persists (z1).
**Animation (local f):**
- **Focus sweep — beat 2:**
  - **In-Store (Cell C)** brightens to sharp/opacity 1 f0–24; A,B settle to 0.85; D stays 0.35. Footer C fades in f80: "ClaimIt preps the guide. You bring it in." The real in-store guide shows its **5 sections** (incl. "If Your Claim Is Denied"). Hold f24–540.
  - **Self-Service (Cell D)** brightens sharp f560–584; others to 0.85. Footer D f640: "ClaimIt maps the steps. You submit." Real self-service pane shows **PAID $500 / NOW $372 / SAVE $128** chips (SAVE chip green-tinted, native) + steps; header reads **"LAX → MIA"** (uppercase, per decision). Hold f584–960.
- **Convergence close of the act:** f960–1080 **all four cells return to equal brightness (opacity 1, sharp)** simultaneously — the "full set" beat. A one-line caption fades in center-bottom (960, 1010) `MICRO` `#6B7280` f1000–1030: "One agent. Every platform's real process."
- Out f1080–1140: grid fades/scales 1.00→0.98 (scale-only) + opacity→0, handing off to Act IV.
**Camera:** static 1.000.
**Focus:** as above.
**In/Out:** in = continuous from S13. out → cross-dissolve into S15 (light, calmer).
**Sound:** **f60** (In-Store lights), **f600** (Self-Service lights). Optional soft chord at f960 (all four equal).
**Notes:** Self-service SAVE chip is the **native green-tinted chip** (`semantic-success/5`) — this is a *UI* green, allowed (it's the product's own, not our hero green). Keep "LAX → MIA" uppercase. The simultaneous "all four equal" at f960 is the visual thesis of the whole demo — don't skip it.
**Data:** DP-13, DP-14, DP-11.

---

### SHOT 15 — The honest boundary
**TC** 2:11–2:30 · global 7860–9000 · **local 0–1140 (1140f)** · Act IV · **Light → begins darkening**
**Purpose:** Maturity / trust. State the limits plainly — this *earns* judge respect.
**Canvas:** `#F9FAFB` slowly cooling toward dark at the very end. Grain 0→0.03 near end.
**Layers (z0→z2):**
- z0 bg.
- z1 **Three trust lines**, stacked, center x=960, `DISPLAY_S` `#101318`, each with a tiny real-UI fragment beside it (a small, sharp crop of the actual control):
  - (y=360) "You approve every claim." + small crop of the Approve-mode toggle / "Approve each claim" radio.
  - (y=500) "Every step is traceable." + small crop of the "Tools · get_reasoning_trace · View trace" line.
  - (y=640) "Least-access Gmail." + small crop of the Gmail scopes chips (`gmail.readonly`, `gmail.send`).
- z2 **Closing honesty line** center (960, 820), `SUB` `#303845`: "ClaimIt prepares the claim. You stay in control — it doesn't promise the refund, it makes sure you can ask for it."
**Animation (local f):**
- Line 1 (+crop) f0–40 opacity 0→1, y+16→0 `EASE_UI`.
- Line 2 (+crop) f160–200 same.
- Line 3 (+crop) f320–360 same.
- Closing line f520–580 opacity 0→1 `EASE_UI`. Hold f580–980.
- **Begin darkening:** f980–1140 bg luminance `#F9FAFB → #0A0A0A`, all text/crops fade out f1020–1140; the directional dark light re-emerges (top-right). This is the light→dark return transition (mirror of Shot 4).
**Camera:** imperceptible push-in 1.000→1.010 f0–980, then static during the darkening.
**Focus:** crops sharp; n/a otherwise.
**In/Out:** in = cross-dissolve from S14. out → continuous luminance fall into S16 (dark).
**Sound:** **f120, f480, f840** (one soft mark per trust line landing).
**Notes:** The small UI crops must be **real, legible fragments** (not icons we draw) — they're micro-proof. Keep them small so the words lead. This shot's restraint sells the product's integrity; don't over-animate.
**Data:** DP-15.

---

### SHOT 16 — Return to the seed
**TC** 2:30–2:41 · global 9000–9660 · **local 0–660 (660f)** · Act IV · **Dark**
**Purpose:** Close the emotional loop. The exact item from Shot 2 returns — and this time the $50 is **back**, green.
**Canvas:** `#0A0A0A`, grain 0.05, directional light 0.07 (settled, calm).
**Layers (z0→z2):**
- z0 dark bg + light.
- z1 **The Sony chip** (DP-1 C1) returns, centered-left (760, 470), same style as Shot 2 (now calm, border opacity 0.12). Its price reads **$349.99** (the post-drop reality).
- z2 **Reclaimed figure** to its right (1180, 470), `MONEY`-scaled-down (88px) **GREEN #1D7A3A**: "+$50.00", with `MICRO` `#1D7A3A` beneath (1180, 540): "reclaimed".
**Animation (local f):**
- Sony chip fades up f0–40 (opacity 0→1, y+16→0 `EASE_UI`).
- "+$50.00" green: f240–276 fades in with a single soft green bloom pulse (the 2nd and final green of the film). Number scale 0.96→1.00 `EASE_UI`. "reclaimed" f276–306.
- Hold f306–620; out f620–660 fade.
**Camera:** static 1.000 (calm).
**Focus:** chip + figure sharp.
**In/Out:** in = continuous dark from S15. out → cross-dissolve to S17 (tagline).
**Sound:** **f300** (the green $50 — a gentle echo of Shot 12's accent, softer).
**Notes:** This is the **second and final** green. The symmetry with Shot 2 (same chip, same item) must be exact — same name, same card style. The viewer should subconsciously recognize "that's the one from the start."
**Data:** DP-1 (C1), DP-16.

---

### SHOT 17 — Tagline reprise
**TC** 2:41–2:52 · global 9660–10320 · **local 0–660 (660f)** · Act IV · **Dark**
**Purpose:** Land the promise — now as a statement of fact, not a question.
**Canvas:** `#0A0A0A`, grain 0.05, light settling.
**Layers:**
- z1 **Tagline** center (960, 500), `DISPLAY` `#FFFFFF`: "Your Money, Still Yours."
**Animation (local f):**
- f0–48 reveal: opacity 0→1 + letter-spacing −1.0px→−2.6px (`EASE_UI`) — the same tracking-tighten as Shot 4 (rhyme).
- The directional light **settles**: f0–200 it eases to its final resting intensity (0.07→0.05) and position (drifts toward center-top), as if "coming home."
- Hold f48–560; out f560–660 (tagline fades slightly, holds presence into credits).
**Camera:** static 1.000.
**Focus:** n/a.
**In/Out:** in = cross-dissolve from S16. out → cross-dissolve to S18 (credits).
**Sound:** **f180** (a final soft swell — resolution).
**Notes:** Same tagline as Shot 4 but **larger, centered, alone** — Shot 4 it was hopeful arrival; here it's calm certainty. The tracking-tighten must match Shot 4 exactly.
**Data:** DP-3.

---

### SHOT 18 — Sign-off
**TC** 2:52–3:00 · global 10320–10800 · **local 0–480 (480f)** · Act IV · **Dark**
**Purpose:** Credits. Quiet, confident, then back to the single point of light we opened on.
**Canvas:** `#0A0A0A`, grain 0.05.
**Layers (z0→z2):**
- z0 dark bg + light.
- z1 **Logo** (ClaimIt shield, white glyph) center (960, 430), small.
- z2 **Credit lines**, center x=960:
  - (y=510) `SUB` `#FFFFFF` weight 500: "ClaimIt"
  - (y=560) `MICRO` `#6B7280`: "Erdun E · Raj Kavathekar · Will Wan · Chris Chen"
  - (y=620) `FOOTNOTE` `#6B7280` opacity 0.6: "claimitai.vercel.app"
**Animation (local f):**
- Logo f0–40 opacity 0→1, scale 0.9→1.0 `EASE_UI`.
- Credits f40–90 staggered opacity 0→1, y+10→0 `EASE_UI`.
- Hold f90–360.
- **Close the film:** f360–480 everything fades to 0; the directional light **retracts to the single top-right point** it began as, then to black by f480 (mirror of Shot 1).
**Camera:** static 1.000.
**Focus:** n/a.
**In/Out:** in = cross-dissolve from S17. out → black (end).
**Sound:** —
**Notes:** Team names exactly as listed (real team). End on the same lone light as the cold open — the film is a closed loop. Last frame is `#000`.
**Data:** DP-16.

---

## PART 4 — DIRECTORY STRUCTURE & ASSEMBLY

```
demo-video/remotion/src/
├── shots/
│   ├── _shared/
│   │   ├── tokens.ts         # colors §1.2, type §1.3, easings §1.4
│   │   ├── Stage.tsx         # floating-window frame §1.5 (shadow, radius, fit 0.92)
│   │   ├── Camera.tsx        # scale-only push-in wrapper §1.6 (.toFixed(5))
│   │   ├── Focus.tsx         # re-export polish/RackFocus presets §1.7
│   │   ├── DarkScene.tsx     # #0A0A0A + directional light + grain 0.05
│   │   ├── LightScene.tsx    # #F9FAFB + cool halo + grain 0
│   │   └── data.ts           # ALL of Part 5 (DP-1..DP-16)
│   ├── shot-01-coldopen__0000-0003/        Shot01.tsx + shot-01.spec.md
│   ├── shot-02-things__0003-0012/
│   ├── shot-03-gap__0012-0018/
│   ├── shot-04-light-logo__0018-0028/
│   ├── shot-05-whatitis__0028-0036/
│   ├── shot-06-monitor__0036-0044/
│   ├── shot-07-enter__0044-0049/
│   ├── shot-08-draft__0049-0059/
│   ├── shot-09-evidence__0059-0107/
│   ├── shot-10-assistant__0107-0117/
│   ├── shot-11-approve__0117-0124/
│   ├── shot-12-moneyback__0124-0132/
│   ├── shot-13-fourways-1__0132-0152/
│   ├── shot-14-fourways-2__0152-0211/
│   ├── shot-15-boundary__0211-0230/
│   ├── shot-16-seed__0230-0241/
│   ├── shot-17-tagline__0241-0252/
│   └── shot-18-signoff__0252-0300/
├── acts/
│   ├── ActI_Hook.tsx         # shots 1–3
│   ├── ActII_Arrival.tsx     # shots 4–5
│   ├── ActIII_Stage.tsx      # shots 6–14 — MOUNTS PriceChart + ClaimShell + grid ONCE at frame 0
│   └── ActIV_Close.tsx       # shots 15–18
└── Timeline.tsx              # one Composition, 10800f, places the four Acts by global frame
```

**Folder names encode start/end** (`__HHMM-HHMM`, mm:ss) per your requirement.

**Assembly rules:**
- `Timeline.tsx` = the only `<Composition durationInFrames={10800} fps={60}>`. It renders the four Acts at their global offsets.
- **ActIII_Stage** is the continuity-critical one: it mounts `PriceChart`, `ClaimShell`, and the four-card grid **all at Act-local frame 0** (dormant ones at opacity 0), and drives each shot's opacity/focus/camera by Act-local frame. Shots 6–14's files are **direction modules** (focus + camera + content-state config) consumed by ActIII_Stage — they do **not** each instantiate their own shell (that would remount → reflow). To re-tune a demo shot, edit its config in its folder; the shell stays put.
- Acts I, II, IV: shots are self-contained components; safe to render/iterate independently.
- Cross-act transitions (Shot 4 dark→light rise; Shot 15 light→dark fall) are owned by the Act that contains them and bleed to the Act boundary; `Timeline.tsx` does NOT add its own transitions.

---

## PART 5 — DATA PACK (verbatim; the only content allowed on screen)

**DP-1 Purchase chips:** Sony WH-1000XM5 Headphones `$399.99`→`$349.99` (hero); 13" MacBook Neo A18 Pro `$952.94`; United UA221 `$310.00`; Hilton Waikiki · 3 nights `$612.00`; KitchenAid Stand Mixer `$99.99`; Anker USB-C Charger `$34.99`.
**DP-2 Gap stat:** "57%" / "of major retailers offer price adjustments"; "7%" (amber) / "of shoppers ever get one"; footnote "Digital Commerce 360 × Bizrate Insights, 2022".
**DP-3 Tagline:** "Your Money, Still Yours."
**DP-4 One-liner:** "ClaimIt watches what you buy." / "When the price drops, it prepares the claim — your way." (navy: "prepares the claim").
**DP-5 Price series** (pricePaid `399.99`, USD; reference line "Paid $399.99"; line `#6B7280` 2px; amber dots r=6 on <paid): 05-19 399.99 / 05-20 399.99 / 05-21 399.99 / 05-22 399.99 / **05-23 379.99 (dropDetected:true)** / 05-24 369.99 / 05-25 369.99 / 05-26 359.99 / 05-27 349.99 / 05-28 349.99 / **05-29 349.99 (current)**. Header "Best Buy · Sony WH-1000XM5 Headphones". Caption "Price drop detected by ClaimIt monitor-agent".
**DP-6 Email draft** (Subject `Price match refund — Order demo-ord-e273a5c7b4`):
> Hello Best Buy Customer Care,
>
> I'm writing to request a price match refund on a recent purchase.
>
> Order demo-ord-e273a5c7b4 — Sony WH-1000XM5 Headphones at $399.99. The current price is $349.99, a difference of $50.00 within the published price match window.
>
> Could you please refund the $50.00 difference to my original payment method? I have the order confirmation and a screenshot of the current price ready to share if you need them.
>
> Thank you,
> [Your name]

**DP-7 Evidence:** Current price card Original `$399.99` / Current `$349.99` / `−$50.00` (amber); screenshot caption "Captured 2026-05-29 11:34 UTC · Price drop detected by ClaimIt monitor-agent · Source: Best Buy"; policy "Read Best Buy policy ↗" / "Policy verified 2026-05-14"; original purchase: date "May 19, 2026", "Order demo-ord-e273a5c7b4", "Price paid $399.99"; clause: "Best Buy Price Match Guarantee: we will match a lower price on an identical item sold by Best Buy within the post-purchase window."
**DP-8 Assistant:** badge "🎯 Claim-focused"; user pill "Explain the policy match"; reply:
> This claim qualifies for a price match based on the Best Buy Price Match Guarantee. The policy states that if an identical product's price drops at Best Buy within the customer's return window, Best Buy will refund the difference.
>
> Here's how this claim matches:
> • Policy Match: The price for the identical headphones dropped by $50.00 at Best Buy, and the purchase date of May 19, 2026, falls within the policy's return window (which expires on June 9, 2026).

tool line "Tools · get_reasoning_trace · View trace"; pills "Make it friendlier · Why this template? · Explain the policy match · Switch to manual approval".
**DP-9 Approve:** button "Approve and send"; dialog title "Send claim email"; body "This will send your price match request to Best Buy from your Gmail. You'll be notified when they respond."; buttons "Cancel" / "Send email"; post-state badge "Submitted"; banner "Submitted — sending from your Gmail."
**DP-10 Money overlay:** "−$50.00" (amber) → "$50.00" (green) ; sub "Still yours."
**DP-11 Four-types label:** "Matches the actual claim process for each platform." Footers: Email "ClaimIt sends it from your Gmail." · Chat "ClaimIt writes the script. You run the chat." · In-Store "ClaimIt preps the guide. You bring it in." · Self-Service "ClaimIt maps the steps. You submit." Closing caption "One agent. Every platform's real process."
**DP-12 Chat (Amazon/Anker)** — paid `$34.99`, current `$16.00`, diff `$18.99` (math-correct; live value):
> Amazon Price Match — Order demo-ord-5441c5cd19
> Step 1: Hi! I'd like to request a price match refund on a recent order.
> Step 2: Order number demo-ord-5441c5cd19 — Anker USB-C Charger.
> Step 3: I paid $34.99 but the current price is $16.00 — please refund the $18.99 difference.
> Step 4: This falls within the published price match window for Amazon.
> Step 5: I have a screenshot of the current lower price; I can share it with you here.
> --- IF AGENT DECLINES ---
> Step 6: Could you please transfer me to a supervisor or open a case for review?
> Step 7: What's the formal submission channel, and can I get a reference number for my records?

**DP-13 In-Store (Target/KitchenAid)** — paid `$99.99`, current `$79.99`, save `$20.00`; 5 sections verbatim:
> ## In-Store Price Match Guide
> **What to Say** — Hi, I'd like to request a Target price match for an item I bought recently — order demo-ord-9187ab5660 — that's now listed at a lower price.
> **What to Bring** — • A printed or digital copy of your order confirmation (Order #: demo-ord-9187ab5660) • A screenshot of the current lower price ($79.99)
> **Talking Points** — 1. The item was purchased recently — within the published price match window. 2. I paid $99.99 originally; the current price is $79.99. 3. Per Target's Price Match Guarantee, the difference should be refunded to my original payment method.
> **Policy Reference** — Target Price Match Guarantee — applies to identical items priced lower at Target within the post-purchase window, refunded to the original tender.
> **If Your Claim Is Denied** — Politely ask for a manager and reference the published price match policy.

**DP-14 Self-Service (Southwest)** — paid `$500.00`, current `$372.00`, save `$128.00`; display header **"LAX → MIA"**; chips PAID `500.00` / NOW `372.00` / SAVE `128.00 USD` (SAVE green-tinted, native); `~3 min`; steps:
> 1. Go to Southwest's self-service portal and locate the order management page
> 2. Enter your Confirmation #: demo-ord-9a7c402215 and your name as it appears on the booking
> 3. Open the "Request a price adjustment" or equivalent form
> 4. Select Southwest LAX → MIA flight from the order item list
> 5. Submit the price difference ($128.00) request — no further action needed after this step
> 6. You'll receive the credit within 1–2 business days

notes: "Eligible only on identical items / itineraries; modifications may void the guarantee." · "Credit posts as a refund to the original payment method or as loyalty credit, depending on Southwest's policy." · "Must be completed within the published window for fastest processing." · footer "Refund to original payment method".
**DP-15 Trust:** "You approve every claim." · "Every step is traceable." · "Least-access Gmail." · closing "ClaimIt prepares the claim. You stay in control — it doesn't promise the refund, it makes sure you can ask for it."
**DP-16 Close/credits:** Sony chip `$349.99` + "+$50.00" (green) "reclaimed"; "Your Money, Still Yours."; "ClaimIt"; "Erdun E · Raj Kavathekar · Will Wan · Chris Chen"; "claimitai.vercel.app".

---

## PART 6 — SOUND ACCENT MAP (for later audio; no audio built yet)
Global-frame beats to score: 480 (drop), 840/940 (gap stats), 1280–1320 (logo lock — emotional up), 2360 (chart drop), 2700 (window set), 3420 ($50 plant), 4110 (assistant question), 4860 (Send confirm), **5130 (amber→green — loudest)**, 5640/5920 (Email/Chat light), 6780/7320 (Store/Self light), 7980/8340/8700 (trust lines), 9300 (green $50 echo), 9840 (tagline swell). Music bed: minimal, warm; silence respected during Shot 12 hold except a sub-bass note on 5130.

---

## PART 7 — RENDER-CHECKS (committed values; confirm visually on first render, adjust within stated tolerance only)
1. **WINDOW_FIT 0.92** — confirm 14px shell text is crisp at this downscale. Tolerance: 0.90–0.95. If soft, raise toward 0.95 (and re-center).
2. **Typewriter cadence (Shot 8)** — tune chars/frame so "$50.00" lands at **local f470 ±10**; full body by f500.
3. **Four-card grid fit (Shots 13–14)** — each real DraftPane must be legible at the ~900×400 cell scale; if not, reduce to a 3-up or enlarge cells (flag before changing layout).
4. **Shot 12 hold length** — 4.4s is intentional; only shorten if total drifts over 3:00 (it must not).
