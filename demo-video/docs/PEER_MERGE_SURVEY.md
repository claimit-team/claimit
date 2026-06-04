# Peer Merge Survey

Date: 2026-06-03
Source: `origin/dev` (5 commits since `72caa73`, fetched read-only)
Status: **PENDING USER DECISION**

## TL;DR
Peer's work is an **entirely separate, fully-assembled 3:00 video** (`src/new-video/NewVideo.tsx`, 9 scenes) built on the **old Erdun shot/act design system** — it reuses the *real* `ClaimDetailShell` via the shim layer, has **no VO, no cursor, no subtitles**, and **touches ZERO sacred files**. It does **not** overlap any beat. The only working-tree collision is `Root.tsx` (both sides edited it, but for different reasons). This is a **composition-level decision** (which video to ship / how to combine), not a per-beat one.

> ⚠️ **READ THIS BEFORE ANY MERGE.** My entire beat rebuild — **`src/beats/**` (0 files tracked), `src/uirefs/**` (0 tracked), `src/polish/Cursor.tsx`, the Beat-based `Root.tsx`, the BEAT_SHEET note — is ALL UNCOMMITTED working-tree work.** It is NOT in `HEAD` and NOT in the backup branch (which only captures the old committed Erdun state at `72caa73`). The prompt's hard rules forbade committing, so I could not snapshot it into the branch. **The user MUST `git stash -u` or commit the working tree before running any `git merge`/`pull`/`checkout` of `origin/dev`, or it will be lost / block the merge.** During THIS survey it was never touched (read-only), so it is currently intact.

## Topology
- **Current branch:** `dev`
- **Backup branch:** `backup/pre-peer-merge-20260603-2338` → points at `72caa73` (the OLD committed Erdun video; does NOT contain the uncommitted beat rebuild — see warning above)
- **out/ backup folder:** `demo-video/remotion/out.backup.20260603-2338/` — **30 mp4s + 130 pngs preserved** (matches `out/` exactly)
- **Peer commits on `origin/dev` not on HEAD:** 5
- **Current commits not on `origin/dev`:** 0 → **NOT divergent at the commit level** (`git rev-list --left-right --count HEAD...origin/dev` = `0  5`). NOTE: this is misleading — my divergence is entirely *uncommitted*, so git's commit-graph sees no divergence.

## Peer's commits (concise)
- `e3e6abb` Merge pull request #317 from claimit-team/feat/demo-video-v2
- `dae5ff2` Merge branch 'dev' into feat/demo-video-v2
- `e0ddf31` **feat(demo-video): add upbeat 3-min product demo (NewVideo)** ← the only demo-video commit
- `882a34d` Change license from MIT to Proprietary License
- `d5e375d` Revise LICENSE for proprietary and hackathon use (#316)

(2 of 5 are LICENSE-only changes at repo root, unrelated to demo-video.)

## Files changed (`git diff --name-status HEAD origin/dev`)
**Added (peer, all new):**
- `demo-video/remotion/public/demo/best-buy-sony-screenshot.svg` (+34) — asset for Scene06
- `demo-video/remotion/src/new-video/NewVideo.tsx` (+55) — the `<Series>` of 9 scenes
- `demo-video/remotion/src/new-video/SCRIPT.md` (+92), `durations.ts` (+33)
- `demo-video/remotion/src/new-video/scenes/Scene01Hook.tsx` (+205), `Scene02Gap` (+131), `Scene03Meet` (+120), `Scene04Ingest` (+324), `Scene05Drop` (+108), `Scene06DemoCore` (+165), `Scene07Platforms` (+63), `Scene08Reach` (+216), `Scene09Close` (+156)

**Modified (peer):**
- `demo-video/remotion/src/Root.tsx` (+10) — adds a `<Composition id="NewVideo">` to the **old Erdun Root** (imports `NewVideo` + `NEW_VIDEO_DURATION_F`). ⚠️ **This is the one collision with my uncommitted work** (my working-tree `Root.tsx` is the wholesale-different Beat-based registry). Not sacred, but a real conflict — resolution is clean conceptually: keep my Beat-based Root and add peer's 10 NewVideo lines.
- `demo-video/remotion/remotion.config.ts` (+10) — webpack `resolve.modules` now includes the project `node_modules` root so apps/web files imported from outside the project resolve their bare imports. **Additive infra fix; I did NOT touch this file → clean. Worth adopting regardless of the video decision.**
- `demo-video/remotion/src/acts/layers/PriceChartLayer.tsx` (+12/−2) — tweak to the OLD Erdun price-chart act layer (used by Scene05). Under `src/acts/`, **not sacred**, I did not touch it → clean. Only relevant if the Erdun act layers are kept.

**Deleted:** none.

## Sacred-list collisions (§0)
**NONE. ✅** Peer modified **zero** files on the sacred list. Verified by restricting `git diff --name-status HEAD origin/dev` to every sacred path (`src/uirefs`, `src/beats`, `polish/{Cursor,BeatSubtitle,HookAtmosphere,easings,tokens}`, `public/audio/vo`, `out`) → empty. `origin/dev` does not even contain my uirefs/Cursor (they're uncommitted). **No CRITICAL CONFLICTS.**

## Peer's approach (judged from code)
- **Assembly:** one `NewVideo` composition = `<Series>` of 9 `<Series.Sequence>` scenes, **3:00 / 10,800f @ 60fps**, scene-local frames. The demo core (Scene06) is one sequence so `ClaimDetailShell` mounts once.
- **Design system:** the **OLD Erdun shot system** — `shots/_shared/{Camera, LightScene, Stage, tokens (COLOR/TYPE/EASE_UI), data, types}` + `acts/layers/{ClaimShellLayer, PriceChartLayer, MoneyOverlayLayer, FourCardGridLayer}` + `_demo/DemoStateContext`.
- **UI fidelity:** Scene06DemoCore mounts the **REAL `ClaimDetailShell`** via `ClaimShellLayer` (imports `@/lib/claim-detail-types`) — live apps/web component (needs the remotion.config resolver fix), NOT a static uiref.
- **Motion:** Camera moves + scene animation. **No virtual cursor.**
- **Audio:** **none detected** in any scene or in NewVideo — the video appears **silent (no VO, no BeatSubtitle)**.
- Uses lucide-react + `staticFile` for logos/screenshots.

## Per-beat assessment table
Peer authored **no beats** — their narrative lives in 9 NewVideo *scenes*, not in `src/beats/`. So for every beat the peer "version" is *(no beat-level change)* → **KEEP CC**. The "Peer scene" column maps each beat to the NewVideo scene covering the same narrative (for combine planning, not a like-for-like swap).

| Beat | CC version (uncommitted) | Peer beat? | Narrative covered by peer scene | Rec |
|---|---|---|---|---|
| b01–b04 (HOOK) | light v1.1 beats, no cursor | none | Scene01Hook / Scene02Gap / Scene03Meet | KEEP CC |
| b05–b09 (ARCH) | arch beats | none | Scene04Ingest / Scene05Drop (partial) | KEEP CC |
| b10 | ui-app-shell-empty + cursor | none | Scene04Ingest | KEEP CC |
| b11 | ui-upload-modal-on-dashboard + cursor | none | Scene04Ingest | KEEP CC |
| b12–b14 | ui-ocr-fields-populated + cursor | none | Scene04Ingest | KEEP CC |
| b15 | ui-dashboard-loaded + cursor | none | Scene05Drop | KEEP CC |
| b16–b18 | ui-purchase-detail-with-chart + cursor | none | Scene05Drop | KEEP CC |
| b19 | ui-claimshell-loaded + cursor | none | Scene06DemoCore (workspace) | KEEP CC |
| b20–b21 | ui-claimshell-assistant-active + cursor | none | Scene06DemoCore | KEEP CC |
| b22–b24 | ui-claimshell-loaded/assistant + cursor | none | Scene06DemoCore | KEEP CC |
| b25 | ui-claimshell-loaded (near-black Approve) + cursor | none | Scene06DemoCore (approve→money) | KEEP CC |
| b26 | ui-sent-confirmation + cursor | none | Scene06DemoCore | KEEP CC |
| b27 | ui-claims-list + cursor | none | Scene06DemoCore / Scene07Platforms | KEEP CC |
| b28–b29 (CRED) | credibility beats | none | Scene07Platforms | KEEP CC |
| b30–b34 | **deleted** (prior phase) | none | Scene08Reach | n/a (deleted) |
| b35 (PAYOFF) | payoff beat | none | Scene09Close | KEEP CC |

## Non-beat assets (peer additions)
- **New audio:** none.
- **New images / logos:** `public/demo/best-buy-sony-screenshot.svg` (1).
- **New fonts:** none.
- **New components:** `src/new-video/` — `NewVideo.tsx`, `durations.ts`, `SCRIPT.md`, and 9 scene components. (All net-new; no overlap with `uirefs/` or `polish/`.)

## CC's recommendations (advisory only — user decides)
- **Definitely KEEP CC:** every beat (b01–b29, b35). Peer touched none of them; the uiref + orange-cursor + locked-VO + subtitle beats are unique, user-approved, and locked.
- **Adopt from peer regardless of the video decision:** the **`remotion.config.ts` resolver fix** (+10 lines, additive, no conflict) — useful infra for any live apps/web imports. The `best-buy-sony-screenshot.svg` asset is harmless to keep.
- **Where peer may be ahead → worth a MERGE discussion:**
  - **Master assembly.** Peer has a fully-composed **3:00 `NewVideo` master**; CC's beats are still **individual compositions with no master timeline**. Peer's `<Series>` 9-scene pattern is a strong template for assembling CC's beats into a single 3:00 film.
  - **Cinematic transitions** (Camera/Stage scene moves) read more "produced" than CC's static-screen + cursor approach in places.
  - **Live `ClaimDetailShell`** (peer) vs **static uiref** (CC): tradeoff — peer's is live/real but heavier and uses the older design tokens; CC's is pixel-faithful, deterministic, and on the current apps/web tokens.
- **The real fork in the road (needs user call + a follow-up `PEER_MERGE_APPLY_v1` spec):**
  1. **Ship CC's beats** → use peer's `<Series>` pattern to assemble them into a master; adopt the config fix. (CC strengths: VO + cursor + fidelity.)
  2. **Ship peer's NewVideo** → but it's silent; would want CC's VO + subtitles layered on.
  3. **Combine** → peer's cinematic scene scaffolding wrapping CC's uiref+cursor+VO beats. Highest effort, best of both.
- **`Root.tsx`:** on whichever path, keep CC's Beat-based Root and splice in peer's `NewVideo` `<Composition>` (10 lines). Trivial, but must be done by hand (not via `git checkout`).

## What we DID NOT do (for the record)
- No `git merge`, `git pull`, `git rebase`, `git checkout origin/dev`, or `git checkout origin/dev -- <path>`.
- No `git stash`, commit, push, or reset. (Backup branch created with a plain `git branch` ref only — no commit.)
- No files in the working tree modified, deleted, or overwritten. Only **additions**, all sanctioned: the backup branch ref, `out.backup.20260603-2338/`, and this `PEER_MERGE_SURVEY.md`.
- No renders triggered.
- No peer files copied into the working tree.
- No sacred-list file touched.

## Awaiting user verdict
Because peer authored no beats, the per-beat verdict is uniformly **KEEP CC**. The decision you actually need to make is **composition-level** (options 1/2/3 above), plus the trivial adopts (config fix, Root splice). After your verdict, a follow-up `PEER_MERGE_APPLY_v1` spec will implement it — **and must begin by stashing/committing the uncommitted beat rebuild** (see the ⚠️ warning at the top).
