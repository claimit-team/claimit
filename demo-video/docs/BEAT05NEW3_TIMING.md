# Beat05New3 — Timing Audit (for VO / subtitle scripting)

**Source:** `demo-video/remotion/src/beats/b05new3_arch-synced/Beat05New3.tsx`
(+ helper `McpCard.tsx`). Read-only audit — derived purely from the
`fromFrame` / `interpolate` / `useReveal` values in the code.

**Frame rate:** 60 fps → `seconds = frame / 60`.
**Registered duration:** `durationInFrames={3380}` in `Root.tsx` → **56.33 s** (0:56).

> ⚠️ **Heads-up on total length.** The original brief estimated "~48 s", but the
> beat as currently coded is **56.33 s** (3380 f). All times below are the real
> coded values. The extra length lives mostly in the 0:20–0:30 pan-to-Assistant
> stretch and the slower MCP cadence.

> ⚠️ **Two caption layers already exist in the beat.** During the agent build
> (0:00–0:30) there are BOTH (a) top-center "keynote callouts" (e.g. *"Gemini
> reads the receipt."*) and (b) bottom burned-in `BeatSubtitle`s (e.g. *"Gemini
> extracts the merchant, item, date, and price."*). The MCP section and endgame
> (0:30–0:56) have **no burned subtitles at all** — that whole stretch is open
> for new VO. See the "OPEN" rows in Section 2.

> **Reveal convention:** components using `useReveal(N)` spring in over ~18 f
> (~0.3 s) from frame `N`. "Settled" below = `N + ~0.3 s`. Draw-on lines (`Wire`)
> animate over 50 f (~0.8 s); arrows (`HArrow`) over 14 f (~0.23 s).

---

## SECTION 1 — Scene-by-scene overview

| Phase | Time (M:SS) | Duration | What's on screen | Dialogue / subtitle window |
|-------|-------------|----------|------------------|----------------------------|
| Intro | 0:00 – 0:03.5 | 3.5 s | "How it works?" fades in big & centered (f0–60), holds, then shrinks + rises to a top-center header (f150–210) where it stays. | Open cold-open space; a ~2.5 s framing line fits, or leave as silent visual. |
| Upload | 0:04 – 0:07.8 | ~3.8 s | Camera framed left (scale 1.4). Upload chip springs in (f240); arrow "receipt.uploaded" draws toward Ingest (f420). | Burned sub S1 *"We start with a receipt — upload it once."* (0:04.7–0:07.8). |
| Ingest + OCR | 0:07.2 – 0:12.3 | ~5 s | Ingest-agent reveals (f430) w/ Gemini+Mongo+Phoenix badges; field chips Merchant/Item/Date/Price stagger (f450–474); "Gemini read it (OCR)" (f490). | Callout *"Gemini reads the receipt."* (0:08.0–0:12.3) + burned sub S2 *"Gemini extracts the merchant, item, date, and price."* (0:08.2–0:12.0). ~3.3 s speech. |
| Monitor | 0:11.7 – 0:16.0 | ~4.3 s | Camera pans right. Arrow "purchase.ingested"; monitor-agent reveals (f710); "every 15 min" pill + down-arrow (f710/725). | Callout *"Gemini watches the price."* (0:12.8–0:16.0) + burned sub S3 *"Every 15 minutes, it checks the current price."* (0:12.3–0:15.7). ~2.8 s. |
| Claim + Sent + draft | 0:15.3 – 0:20.0 | ~4.7 s | Pan right. Arrow "price.dropped"; claim-agent reveals (f930); arrow "claim.sent" → Sent-to-Costco card (f948); typewriter draft "Hello Costco…" types f959–983. | Callout *"Gemini drafts the email."* (0:16.5–0:20.0) + burned sub S4 *"When the price drops, claim-agent drafts and sends your email."* (0:16.0–0:19.8). ~3.0 s. |
| Pan to Assistant | 0:20.0 – 0:26.4 | ~6.4 s | Camera holds focus drifting toward the Assistant region (still 1.4×). Sidecar divider line draws (f1545–1575). **No new card, no callout, no subtitle** until ~0:26.4. | **Big OPEN bridge** — no burned caption between S4 (ends 0:19.8) and S5 (starts 0:26.5). ~5.5 s speech available. |
| Assistant | 0:26.4 – 0:30.3 | ~3.9 s | assistant-agent reveals (f1585, right sidecar) w/ 4 badges (Gemini+Mongo+Phoenix+Elastic). | Callout *"Gemini answers your questions."* (0:26.7–0:30.3) + burned sub S5 *"And the assistant is always there when you need it."* (0:26.5–0:29.8). ~3.0 s. |
| Camera merge (zoom-out) | 0:31.0 – 0:33.5 | 2.5 s | ONE continuous eased move: scale 1.4→0.85, recenter (Assistant→center), lift up. Architecture settles into the **upper half**; lower half empties. No caption. | OPEN transition slot ~2.0 s. |
| Pre-MCP title | 0:33.8 – 0:36.0 | ~2.2 s | "Grounded by open MCP servers" (bold) + "How our *Gemini* agents pull real, live context" (gradient Gemini) fade/slide in (f2030) below the arch. | OPEN ~1.7 s — VO can read/introduce the MCP layer. |
| D1 — MongoDB MCP | 0:36.0 – 0:39.7 | ~3.7 s | MongoDB card (lower-left) + node (bottom-center of arch) spring in together (f2160); solid blue lines draw to all 4 agents (f2190–2240). | **OPEN — prime VO** ~3.0 s. MongoDB MCP role. |
| D2 — Elasticsearch | 0:39.7 – 0:43.3 | ~3.6 s | Elasticsearch card (lower-right) + node (right) spring in (f2380); solid amber line draws to Assistant only (f2410–2460). | **OPEN — prime VO** ~3.0 s. Elasticsearch role. |
| D3 — Arize Phoenix | 0:43.3 – 0:47.0 | ~3.7 s | Phoenix card (lower-center) + node (right-center) spring in (f2600); dashed lavender lines draw to all 4 agents (f2630–2680). Phoenix uses our png. | **OPEN — prime VO** ~3.0 s. Phoenix role. |
| Phase E — fade + rise | 0:47.0 – 0:50.5 | ~3.5 s | Architecture (agents + nodes + wires) fades to 0 (f2820–2960) & drifts up; the 3 cards + "Grounded…" title rise into the upper half (f2840–3040). | OPEN ~2.8 s — transition / "all grounded in real data" line. |
| Techstack reveal | 0:50.5 – 0:52.0 | ~1.5 s | "Built on Google Cloud + ✨ Gemini" title (f3030) + 9-logo row staggers in below cards (f3070–3118). | OPEN ~1.0 s — closing credit line. |
| Phase F — hold | 0:52.0 – 0:54.7 | ~2.7 s | Full static hold: [3 MCP cards + "Grounded…" title + techstack title + 9 logos]. | OPEN ~2.2 s — final closing line lands here. |
| Phase G — outro | 0:54.7 – 0:56.3 | ~1.6 s | Everything fades opacity 1→0 (f3280–3380). | Tail — let the last line breathe out; silence. |

---

## SECTION 2 — Precise subtitle-timing table (0.1 s precision)

Speech-budget rule of thumb used below: spoken English ≈ 2.5–3 words/sec
(4–5 syllables/sec). "Speech ≈ Xs" = window minus ~0.5 s breath each side.

| Start | End | Duration | Suggested subtitle slot | Notes |
|-------|-----|----------|-------------------------|-------|
| 0:00.0 | 0:03.5 | 3.5 s | Intro "How it works?" reveal — silence or short framing line | Title is itself the visual statement. Speech ≈ 2.5 s if used. |
| 0:04.0 | 0:07.8 | 3.8 s | Upload chip in; arrow to Ingest. **[burned S1: "We start with a receipt — upload it once."]** | Existing bottom subtitle. VO can echo/replace. Speech ≈ 2.5 s. |
| 0:08.0 | 0:12.3 | 4.3 s | Ingest reveals; callout **"Gemini reads the receipt."** + **[burned S2: "Gemini extracts the merchant, item, date, and price."]** | Two captions stacked (callout top / sub bottom). Field chips pop 0:07.5–0:08.1. Speech ≈ 3.3 s. |
| 0:12.3 | 0:16.0 | 3.7 s | Monitor reveals; callout **"Gemini watches the price."** + **[burned S3: "Every 15 minutes, it checks the current price."]** | "every 15 min" pill at 0:12.1. Speech ≈ 2.8 s. |
| 0:16.0 | 0:20.0 | 4.0 s | Claim + Sent + typewriter; callout **"Gemini drafts the email."** + **[burned S4: "When the price drops, claim-agent drafts and sends your email."]** | Draft types 0:16.0–0:16.4. Speech ≈ 3.0 s. |
| 0:20.0 | 0:23.2 | 3.2 s | **OPEN** — camera panning toward Assistant; nothing revealing | No caption here. Bridge line slot. Speech ≈ 2.6 s. |
| 0:23.2 | 0:26.4 | 3.2 s | **OPEN** — pan continues; divider draws 0:25.8 | Still no caption. Speech ≈ 2.6 s. (Rows 6–7 = one ~6.4 s bridge if desired.) |
| 0:26.7 | 0:30.3 | 3.6 s | Assistant reveals; callout **"Gemini answers your questions."** + **[burned S5: "And the assistant is always there when you need it."]** | Last burned subtitle in the beat. Speech ≈ 3.0 s. |
| 0:30.3 | 0:31.0 | 0.7 s | Brief settle before the camera merge | Breath / no speech. |
| 0:31.0 | 0:33.5 | 2.5 s | **OPEN** — continuous zoom-out + recenter + lift to upper half | Transition line. Speech ≈ 2.0 s. |
| 0:33.8 | 0:36.0 | 2.2 s | **OPEN** — "Grounded by open MCP servers" title fades in | VO can voice/introduce the MCP grounding. Speech ≈ 1.7 s. |
| 0:36.0 | 0:39.7 | 3.7 s | **OPEN** — D1 MongoDB card + node + blue lines (synced) | **Prime VO.** MongoDB MCP = live purchases/claims. Speech ≈ 3.0 s. |
| 0:39.7 | 0:43.3 | 3.6 s | **OPEN** — D2 Elasticsearch card + node + amber line (synced) | **Prime VO.** Elasticsearch = store policy search. Speech ≈ 3.0 s. |
| 0:43.3 | 0:47.0 | 3.7 s | **OPEN** — D3 Arize Phoenix card + node + lavender lines (synced) | **Prime VO.** Phoenix = self-eval from traces. Speech ≈ 3.0 s. |
| 0:47.0 | 0:49.3 | 2.3 s | **OPEN** — architecture fades out, cards begin rising | Transition/summary. Speech ≈ 1.8 s. |
| 0:49.3 | 0:50.5 | 1.2 s | **OPEN** — cards finish rising; title settles up top | Bridge into techstack. Speech ≈ 0.7 s (or merge with next). |
| 0:50.5 | 0:52.0 | 1.5 s | **OPEN** — "Built on Google Cloud + ✨ Gemini" + logos stagger in | Closing credit beat. Speech ≈ 1.0 s. |
| 0:52.0 | 0:54.7 | 2.7 s | **OPEN** — full hold [3 cards + techstack] | Final closing line lands here. Speech ≈ 2.2 s. |
| 0:54.7 | 0:56.3 | 1.6 s | **OPEN** — global fade-out | Tail; keep silent or let last word ring out. |

### Ambiguities / judgment notes for review

1. **Total = 56.33 s, not ~48 s.** If the target film slot is ~48 s, the easiest
   trims are the 0:20–0:26.4 pan-to-Assistant bridge (~6 s) and tightening the
   D1/D2/D3 cadence (each ~3.7 s). Flagging — no changes made.
2. **Callout vs burned subtitle overlap (0:08–0:30):** every agent moment shows a
   top callout AND a bottom `BeatSubtitle` simultaneously. If VO is added here it
   will be a *third* layer — consider whether VO should replace the burned subs
   (they're hard-coded in the component, not a separate track).
3. **`useReveal` settle (~0.3 s)** and **`Wire` draw (~0.8 s)** are approximated;
   exact perceived "landed" moments may be ±0.2 s.
4. **Camera merge window (0:31.0–0:33.5)** is a single `interpolate` spanning what
   used to be two phases — treat it as one continuous motion, not a cut.
5. **Phase E rows (0:47–0:50.5)** overlap two animations (arch fade f2820–2960 +
   card rise f2840–3040); the "feel" of the swap completing is ~0:50.5.

---

## Report

- **Total beat duration:** 0:56 (56.33 s / 3380 f @ 60 fps)
- **Total speech windows:** ~16 natural slots (Section 1) / ~19 fine slots (Section 2)
- **Total speech-available time:** ~41 s across all slots (window minus breath)
  - of which **~30 s overlaps the agent build (0:00–0:30)**, which *already* carries 5 burned subtitles + 4 callouts
  - and **~19 s is genuinely open new-VO room** in the MCP + endgame stretch (0:30–0:56), with **no existing burned captions**
- **Recommended VO total length:**
  - If narrating the whole beat: **~38–41 s** of speech (leave ~0.5 s breath before/after each line; ~15 s of the 56 s stays as breathing room / pure visual)
  - If only scripting the open MCP+endgame section: **~16–19 s** of new VO (0:33.8–0:54.7)
