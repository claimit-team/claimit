# ClaimIt — New Demo Video (v2) · Script & Shot Plan

**Tagline:** *Your Money, Still Yours.*
**Length:** 3:00 hard cap (10,800 frames @ 60fps · 1920×1080)
**Audience:** Hackathon judges + consumers — accessible, high-level on tech (no deep jargon)
**Tone:** Upbeat product demo — bright, energetic, confident; still clean/premium. Keeps the emotional payoff (money reclaimed) but plays it *celebratory*, not meditative.
**Hero example:** Best Buy · Sony WH-1000XM5 · paid **$399.99** → drops to **$349.99** = **$50 back** (the one fully-live, asset-backed path; matches `data.ts` SONY_CLAIM).

**Same DNA, reused:** design tokens (`shots/_shared/tokens.ts`), Inter type scale, `Stage`/`Camera`/`DarkScene`/`LightScene`, the real `ClaimDetailShell` (draft/evidence/assistant) via the shim layer, a real Recharts price chart, audio library (SFX + music bed; VO regenerated for this script).

**Improvements applied vs. the existing 18-shot film:** one hero product throughout (no Sony↔AirPods drift), the four-claim-types section **compressed** (~16s, not ~39s), the **reasoning trace surfaced earlier** (in the workspace beat), tighter cold open so concrete value lands by ~0:08, brighter palette and faster cuts for the upbeat tone.

---

## Color discipline (kept as punctuation)
- **NAVY `#27466E`** = brand. **AMBER `#F59E0B`** = price-drop / pending. **GREEN `#1D7A3A`** = reclaimed money — used in exactly **two** places (the money beat + the close echo).
- Upbeat adjustment: more **white/light scenes**, quicker entrances (~24f), light directional bloom on brand moments. Grain only on the brief dark beats.

---

## Accuracy guardrails (baked into the VO)
- "Most **big** retailers" — not "all stores." Best Buy is the live demo; other platforms shown are demo data.
- Claims are **human-in-the-loop** — *you approve every claim*. Say "one click to approve," never "auto-submitted."
- Email claims send **from your own Gmail**; chat/in-store/self-service produce a script/guide **you** complete.
- "Built on Gemini + Google Cloud" stays **high-level** — name the tech, don't overclaim autonomy.
- Stats phrased safely: "billions left unclaimed every year" (well-supported); show the source citation small.

---

## Full voiceover (read upbeat, ~165 wpm; UI beats breathe between lines)

> **[HOOK]**
> You buy something. A week later, the price drops — and that store actually owes you the difference.
> You just never find out.
>
> **[THE GAP]**
> Most big retailers will refund you when the price falls. But the windows are short, every store has different rules, and — let's be honest — who has the time?
> So billions of dollars go unclaimed every year. Money that was always yours.
>
> **[MEET CLAIMIT]**
> Meet ClaimIt. It watches what you buy, and the second a price drops, it builds the refund claim — for you.
>
> **[DEMO · INGEST — Ingest agent]**
> Connect your Gmail, or just snap a receipt — and the **Ingest agent** reads it instantly: brand, item, price, the protection window.
>
> **[DEMO · THE DROP — Monitor agent]**
> From there, the **Monitor agent** watches the price. These Sony headphones from Best Buy — three ninety-nine — slip to three forty-nine. It checks Best Buy's own policy and confirms: you're owed fifty dollars back.
>
> **[DEMO · THE WORKSPACE — Claim + Assistant agents]**
> The **Claim agent** has everything ready in one place — the drafted claim, and the proof: your receipt, the policy clause, a screenshot of the new price. And an **Assistant agent** that actually knows *your* claim — ask it anything, and see exactly how it reasoned.
>
> **[DEMO · APPROVE → MONEY BACK]**
> One click to approve. The email sends from *your* Gmail — your name, your account. Best Buy replies to you, not to us.
> And just like that — fifty dollars, back in your pocket.
>
> **[DEMO · EVERY PLATFORM]**
> Every store does claims differently — an email, a chat script, an in-store guide, a tap-through. ClaimIt handles all of them, the right way for each.
>
> **[REACH]**
> Retail, airlines, hotels — one agent, every checkout.
>
> **[SPONSORS · MCP]**
> Under the hood, our Gemini agents run on open MCP: they read your data through **MongoDB**, search store policies through **Elasticsearch**, and grade their own work by reading their traces in **Arize Phoenix**. Built on Google Cloud and Gemini.
>
> **[CLOSE]**
> ClaimIt. Your money — still yours. We just make sure you get it.

*(~300 words; remaining runtime is intentional UI/animation breathing room — the demo plays on screen between lines.)*

---

## Shot plan (10 scenes · 10,800f total)

| # | Scene | Time | Frames | On-screen | Reuse / build |
|---|-------|------|--------|-----------|---------------|
| 1 | **Hook** | 0:00–0:12 | 720 | Purchase-chip montage; Sony ticks $399.99→$349.99 amber, "owed $50" badge; kicker | chips from `data.ts` |
| 2 | **The Gap** | 0:12–0:26 | 840 | Count-up to **$10B+ unclaimed**; "almost no one claims it" | `TYPE.STAT` count-up |
| 3 | **Meet ClaimIt** | 0:26–0:38 | 720 | Shield + wordmark snap + tagline + one-liner | brand bloom |
| 4 | **Ingest** | 0:38–0:54 | 960 | Gmail badge + dropzone → fields fill; bottom names **Ingest Agent · powered by Gemini** | custom UI + `AgentBadge` |
| 5 | **The Drop** | 0:54–1:10 | 960 | Real Recharts chart, amber dots **pop**, eligibility pill; **Monitor Agent** badge | `PriceChartLayer` + `AgentBadge` |
| 6 | **Demo core** | 1:10–2:02 | 3120 | Real `ClaimDetailShell`: draft→evidence→assistant + **View trace** → approve → **$50 turns green**; **Claim Agent** then **Assistant Agent** badges | `ClaimShellLayer` + `MoneyOverlayLayer` (shell mounted once) |
| 7 | **Every Platform** | 2:02–2:18 | 960 | 4 real claim formats (email/chat/in-store/self-service); closing caption removed | `FourCardGridLayer` |
| 8 | **Reach** | 2:18–2:28 | 600 | 26-logo platform wall (retail/airlines/hotels) | `platformlogo/` SVGs |
| 9 | **Sponsors · MCP** | 2:28–2:42 | 840 | **MongoDB MCP** (Assistant reads live data) · **Elasticsearch MCP** (Assistant searches policies) · **Arize Phoenix MCP** (agents self-evaluate from traces); Google Cloud + Gemini footer | `brandlogos/` SVGs (Remotion `<Img>`), `AgentBadge` brand |
| 10 | **Close** | 2:42–3:00 | 1080 | Tagline reprise → ClaimIt · `claimitai.vercel.app` · `github.com/claimit-team/claimit` · team | mirror close |

**Agents named across the flow:** Ingest (S4) → Monitor (S5) → Claim + Assistant (S6), each "powered by Gemini" via the shared `AgentBadge` in `src/new-video/brand.tsx`.
**Sponsor MCPs** get a dedicated spotlight in S9 (judging-relevant).

---

## Build notes (for when approved)
- Each scene = one component under `src/new-video/scenes/SceneNN.tsx`, sequenced in `NewVideo.tsx` via `<Series>`/`<Sequence>`; register `NewVideo` (already done) at 10,800f.
- Reuse the real `ClaimDetailShell` exactly as Act III does (per-frame `claim` prop, shims neutralize network/auth). The four-types grid reuses the `DraftPane` preview renderers.
- VO: regenerate per-scene stems via `scripts/gen_vo.mjs` (needs `ELEVENLABS_API_KEY`); SFX + music bed already committed.
- Keep `apps/web` read-only — all adaptation via shims + film-side overlays.
