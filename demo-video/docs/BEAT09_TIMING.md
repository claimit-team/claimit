# Beat09 — Timing Audit (for VO / subtitle scripting)

**Source:** `demo-video/remotion/src/beats/b09_demo-reach-policies/`
— `Beat09.tsx` (orchestrator), `Scene08ReachLogosFast.tsx` (26-logo wall fork),
`Scene07PlatformFast.tsx` (4 policy-type cards fork).

**Frame rate:** 60 fps → `seconds = frame / 60`.
**Registered duration:** `durationInFrames={880}` → **14.67 s** (0:15).

> Mirrors the format of `BEAT05NEW3_TIMING.md`. Times are the real coded values.

> **Reflects the post-swap state** (Best Buy + Target promoted to lead logo
> positions; Amazon moved to a middle slot; chat policy card = Macy's). The
> Amazon→Best Buy/Target swap only changed *which* logos sit *where* and the
> chat card's platform label — it did **not** change any frame/phase timing, so
> this audit holds regardless.

> **Two visual caption layers already exist:** (a) two burned `BeatSubtitle`s
> (orange pill, bottom) — S1 *"26+ retailers, and counting."* and S2 *"Every
> store has its own rules — we handle them all."*; (b) on-screen text labels
> (headline, the "Retail · Airlines · Hotels" sub, the "Every store, its own
> policy." section title, and each policy card's header `Platform / Type`).
> Much of the beat is already self-captioning — see notes.

> **Reveal/animation conventions:** logo cells fade+slide over 26 f (~0.43 s);
> policy cards fade+slide+blur-sharpen over ~30–44 f (~0.5–0.73 s); the push-up
> (logo wall exits, grid rises) runs f540–620 (~1.3 s). A slow creep-zoom
> (scale 0.88→1.0 by f40, then →1.035 by f860) runs the whole beat.

---

## SECTION 1 — Scene-by-scene overview

| Phase | Time (M:SS) | Duration | What's on screen | Dialogue / subtitle window |
|-------|-------------|----------|------------------|----------------------------|
| Entry | 0:00 – 0:00.7 | ~0.7 s | Composition fades in (f0–30) under a creep-zoom (scale 0.88→1.0 by f40); headline "One agent. Every checkout." begins (f8); bottom empty. | Open / silent entry; ~0.5 s if used. |
| Logo wall reveal | 0:00.7 – 0:04.5 | ~3.8 s | 26 retailer logos stagger in (`at = 70 + i*7`): **Best Buy first, Target second**, … Amazon mid-grid, … Wyndham last (f245). "Retail · Airlines · Hotels" sub. Bottom held empty. | Burned **S1** *"26+ retailers, and counting."* (0:01.2–0:05.2). ~3.5 s speech. |
| Logo wall hold | 0:04.5 – 0:05.7 | ~1.2 s | All 26 logos shown, holding. Bottom still empty (reserved for the policy grid). | Tail of S1; brief open ~0.6 s. |
| Policy title in | 0:05.7 – 0:07.2 | ~1.5 s | Blue "Every store, its own policy." fades into the empty bottom (titleOp f340–400). Logo wall still up top. | S2 begins at 0:06.3. ~1.0 s. |
| Row 1 cards | 0:07.2 – 0:09.0 | ~1.8 s | Top 2 policy cards reveal (blur-sharpen pop): **Best Buy / Email** and **Macy's / Chat Script**; card footers at f510–550. Logo wall still visible above. | Burned **S2** *"Every store has its own rules — we handle them all."* (0:06.3–0:10.8). ~1.6 s. Card headers self-caption. |
| Row 2 + push-up | 0:09.0 – 0:10.3 | ~1.3 s | Bottom 2 cards reveal (**Target / In-Store**, **Southwest / Self-Service**); SIMULTANEOUSLY the logo wall slides up (f540–610) + fades (f540–600), and the 4-card grid rises to fill the screen (f540–620). | S2 still running. Busy transition — best left to the visuals. |
| 4-UI slow scroll | 0:10.3 – 0:13.7 | ~3.3 s | All 4 policy cards centered, gentle continuous drift up (gridTy f680–860, −70px). Logo wall gone. The "every policy type, handled" payoff. | S2 ends 0:10.8 → **OPEN ~2.9 s** (the prime VO slot). Card headers/footers still caption each type. |
| Exit fade | 0:13.7 – 0:14.7 | ~1.0 s | Whole composition fades opacity 1→0 (f820–875); creep-zoom continues to 1.035. | Tail; silence. |

---

## SECTION 2 — Precise subtitle-timing table (0.1 s precision)

Speech-budget rule: ≈ 2.5–3 words/sec; "Speech ≈ Xs" = window minus ~0.5 s breath.

| Start | End | Duration | Suggested subtitle slot | Notes |
|-------|-----|----------|-------------------------|-------|
| 0:00.0 | 0:01.2 | 1.2 s | Entry creep-zoom + fade-in; headline appearing | Silent or a short open line. Speech ≈ 0.7 s. |
| 0:01.2 | 0:05.2 | 4.0 s | Logo wall staggers in. **[burned S1: "26+ retailers, and counting."]** | Existing bottom subtitle (f70–310). VO can echo/extend. Speech ≈ 3.5 s. |
| 0:05.2 | 0:06.3 | 1.1 s | Logos held; bottom empty; title about to drop in | OPEN bridge. Speech ≈ 0.6 s. |
| 0:06.3 | 0:07.2 | 0.9 s | "Every store, its own policy." fades in. **[burned S2 starts 0:06.3]** | Section title is itself a caption. Speech ≈ 0.5 s. |
| 0:07.2 | 0:09.0 | 1.8 s | Row 1 cards reveal — Best Buy/Email + Macy's/Chat. **[S2 running]** | Card headers already label platform + type. Speech ≈ 1.6 s (likely redundant w/ visuals). |
| 0:09.0 | 0:10.8 | 1.8 s | Row 2 cards reveal + logo wall pushes up + grid rises. **[S2 ends 0:10.8]** | Heavy motion; recommend riding the visual, no new line. |
| 0:10.8 | 0:13.0 | 2.2 s | 4 cards centered, slow drift up — no subtitle | **OPEN — prime VO.** Summary of "every policy type, handled." Speech ≈ 1.8 s. |
| 0:13.0 | 0:13.7 | 0.7 s | Cards still drifting; pre-exit | OPEN tail of the scroll slot. Speech ≈ 0.4 s (or merge w/ row above → ~2.2 s line). |
| 0:13.7 | 0:14.7 | 1.0 s | Exit fade-out | Tail; keep silent / let last word ring out. |

### Ambiguities / judgment notes

1. **Heavy self-captioning.** The two burned subtitles (S1, S2) span 0:01.2–0:10.8,
   and the on-screen text (headline, section title, the four `Platform / Type`
   card headers, card footers) carries most of the meaning. New VO is most
   valuable in the **0:10.8–0:13.7 4-card hold** (~2.9 s) and optionally the
   entry. Narrating over 0:07–0:10.8 risks duplicating what the cards already say.
2. **S2 overruns the row-1 window.** S2 (f380–650) starts during the title-in
   and ends mid-4-UI-scroll, bridging phases C→E — treat it as one continuous
   line over the policy reveal, not phase-locked.
3. **Card platforms (post-swap):** Best Buy = Email, Macy's = Chat Script,
   Target = In-Store, Southwest = Self-Service. If VO names a platform, match
   these (do not say "Amazon").
4. **Creep-zoom is continuous**, not a cut — every phase is slowly scaling up.

---

## Report

- **Total beat duration:** 0:15 (14.67 s / 880 f @ 60 fps)
- **Total speech windows:** ~6 natural slots (Section 1) / ~9 fine slots (Section 2)
- **Total speech-available time:** ~10 s across all slots (window minus breath)
  - of which **~7 s overlaps the logo-wall + policy reveal (0:01.2–0:10.8)**, already covered by the 2 burned subtitles **and** on-screen card labels
  - and **~3 s is genuinely open new-VO room** in the 4-card hold (0:10.8–0:13.7), plus ~0.7 s at entry
- **Visual labels already acting as captions:** headline "One agent. Every checkout."; "Retail · Airlines · Hotels"; the 26 logos; section title "Every store, its own policy."; each card header (`Best Buy / Email`, `Macy's / Chat Script`, `Target / In-Store`, `Southwest / Self-Service`) and card footers. Treat these as existing captions — VO should add narration, not re-read them.
- **Recommended VO total length:** ~6–8 s of speech if narrating lightly (one line over the logo wall echoing S1, one line over the 4-card hold), leaving the dense policy-reveal to its visuals; or up to ~10 s for fuller narration.
