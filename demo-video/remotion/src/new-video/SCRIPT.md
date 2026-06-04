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
> **[DEMO · INGEST]**
> Connect your Gmail, or just snap a receipt. ClaimIt reads it instantly — brand, item, price, the protection window — and starts watching.
>
> **[DEMO · THE DROP]**
> Take these Sony headphones from Best Buy — three ninety-nine. Three days later, the price slips to three forty-nine. ClaimIt catches it, checks Best Buy's own policy, and confirms: you're owed fifty dollars back.
>
> **[DEMO · THE WORKSPACE]**
> Everything's ready in one place. The drafted claim. The proof — your receipt, the policy clause, a screenshot of the new price. And an assistant that actually knows *your* claim — ask it anything, and see exactly how it reasoned.
>
> **[DEMO · APPROVE → MONEY BACK]**
> One click to approve. The email sends from *your* Gmail — your name, your account. Best Buy replies to you, not to us.
> And just like that — fifty dollars, back in your pocket.
>
> **[DEMO · EVERY PLATFORM]**
> Every store does claims differently — an email, a chat script, an in-store guide, a tap-through. ClaimIt handles all of them, the right way for each.
>
> **[REACH + TECH]**
> Retail, airlines, hotels — one agent, every checkout. Built on Gemini and Google Cloud, and you approve every claim. You're always in control.
>
> **[CLOSE]**
> ClaimIt. Your money — still yours. We just make sure you get it.

*(~300 words; remaining runtime is intentional UI/animation breathing room — the demo plays on screen between lines.)*

---

## Shot plan (10 scenes · 10,800f total)

| # | Scene | Time | Frames | On-screen | Reuse / build | Audio |
|---|-------|------|--------|-----------|---------------|-------|
| 1 | **Hook** | 0:00–0:12 | 720 | Fast montage of purchase chips (DP-1 style), one price ticks $399.99→$349.99 in amber, "$50 you're owed" stamp on the Sony chip | `DarkScene`→`LightScene` quick lift; chips from `data.ts`; amber drop motion | music in; `sfx_pricedrop` on the drop |
| 2 | **The Gap** | 0:12–0:30 | 1080 | Big stat pair: "Most major retailers offer price protection." / "Almost no one claims it." → "$10B+ unclaimed every year" (amber); small citation | `LightScene`, `TYPE.STAT`/`DISPLAY_S`; count-up | soft accent on stat |
| 3 | **Meet ClaimIt** | 0:30–0:42 | 720 | Brand snap: "ClaimIt" (Inter DISPLAY, tracking tighten) + tagline "Your Money, Still Yours." + one-line what-it-is | Mirror Shot04 logo/light bloom, brighter | `sfx_logo` brand sting |
| 4 | **Ingest** | 0:42–0:58 | 960 | Gmail-connect badge + receipt dropzone (HeroNewUser look); Gemini fills extracted fields (brand/item/price/window) | Rebuild dropzone + a field-fill card from dashboard/confirm UI tokens | `sfx_type` ticks as fields fill |
| 5 | **The Drop** | 0:58–1:14 | 960 | Real price chart draws L→R, amber drop dot, "Price drop detected" pill; header "Best Buy · Sony WH-1000XM5"; "$50 back · 11 days left" | Recharts price chart (`PriceChartLayer` pattern) | `sfx_chartbottom` at the low point |
| 6 | **The Workspace** | 1:14–1:44 | 1800 | Real `ClaimDetailShell`: draft email typewriter → evidence cards → assistant Q&A with **"View trace"** surfaced | **Reuse `ClaimDetailShell`** via shim; `RackFocus` to move the eye pane→pane | `sfx_type`; soft send tick |
| 7 | **Approve → Money** | 1:44–2:06 | 1320 | Cursor → "Approve and send" → confirm dialog ("sends from your Gmail") → badge → **money beat:** −$50 amber → **+$50 GREEN "Reclaimed"** (celebratory pop, short hold) | Faux approve dialog overlay; `Bloom` on money | `sfx_approve` + `sfx_money`/`sfx_reclaim` |
| 8 | **Every Platform** | 2:06–2:22 | 960 | 2×2 quick: Email · Chat script · In-store guide · Self-service, each a real `DraftPane` renderer; converge to equal | Reuse the 4 `DraftPane` preview renderers (`FOUR_CARD_GRID_CLAIMS`) | light chord on converge |
| 9 | **Reach + Tech** | 2:22–2:42 | 1200 | Platform logo wall (retail/airline/hotel SVGs) → "Built on Google Cloud + Gemini" with brand logos (gemini, googlecloud, mongodb, …) | **Wire the unused `platformlogo/` + `brandlogos/` SVGs** | upbeat swell |
| 10 | **Close** | 2:42–3:00 | 1080 | Tagline reprise "Your Money, Still Yours." → sign-off: ClaimIt · `claimitai.vercel.app` · GitHub repo · team (Erdun · Raj · Will · Chris) | Mirror Shot17/18 close, brighter button | `sfx_tagline`; music out |

**New assets I'd wire that exist but are currently unused:** `public/platformlogo/` (24 SVGs) and `public/brandlogos/` (8 tech SVGs) — perfect for the Reach + Tech scene's high-level tech overview.

---

## Build notes (for when approved)
- Each scene = one component under `src/new-video/scenes/SceneNN.tsx`, sequenced in `NewVideo.tsx` via `<Series>`/`<Sequence>`; register `NewVideo` (already done) at 10,800f.
- Reuse the real `ClaimDetailShell` exactly as Act III does (per-frame `claim` prop, shims neutralize network/auth). The four-types grid reuses the `DraftPane` preview renderers.
- VO: regenerate per-scene stems via `scripts/gen_vo.mjs` (needs `ELEVENLABS_API_KEY`); SFX + music bed already committed.
- Keep `apps/web` read-only — all adaptation via shims + film-side overlays.
