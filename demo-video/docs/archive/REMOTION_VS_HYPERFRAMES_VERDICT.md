# Remotion vs HyperFrames — Reuse Experiment Verdict

**Question asked:** Can Remotion REUSE ClaimIt's real React components (the `/claims/[id]` three-pane UI) with mock data, or does dependency entanglement make reuse impractical?

**Short answer: YES, reuse works.** All four staged renders pass and the actual `<ClaimDetailShell>` from `apps/web/src/components/claims/` renders pixel-faithful at 1920×1080. **Cost: ~440 lines of one-time glue code** (webpack config + shims + mocks).

Verdict — **YELLOW with a strong recommendation to switch.** Details below.

---

## 1. Stage-by-stage results

| Stage | What was tested | Result | Screenshot |
|-------|-----------------|--------|------------|
| 0 | Toolchain sanity: hello-world still at 1920×1080 | ✅ Pass | [out/stage-0.png](./out/stage-0.png) |
| 1 | Import shadcn `<Badge>` + `<Button>` from `apps/web/components/ui/`, render with Tailwind v4 classes | ✅ Pass after 3 build fixes | [out/stage-1.png](./out/stage-1.png) |
| 2 | Import real `evidence-pane.tsx` (407 lines) with mock `ClaimDetail` | ✅ Pass after ~5 shims | [out/stage-2.png](./out/stage-2.png) |
| 3 | Full three-pane shell: `claim-detail-shell.tsx` + draft + evidence + assistant + header | ✅ Pass after ~10 more shims | [out/stage-3.png](./out/stage-3.png) |
| Studio | Live preview via `npx remotion studio` | ✅ Pass — built in 2.4s, served HTTP 200 | n/a (browser preview) |

### What Stage 3 actually rendered

The screenshot in `out/stage-3.png` is the **real product UI**, untouched: claim header with status badge + Edit/Cancel/Approve buttons, 40/60 horizontal split via `react-resizable-panels`, Email Draft pane with the Best Buy mock email, Evidence pane with the AirPods Pro price-drop card + Best Buy policy clause, Assistant pane with quick-action pills and message input. Every component file under test is the **production code at HEAD**, unmodified. The only thing we wrote is the props.

---

## 2. Dependency table — what worked, what needed a shim

| Concern | Real dep | Worked? | Shim required |
|---|---|---|---|
| Path alias `@/* → src/*` | Next/TS resolver | ❌ Not auto | Webpack alias `@` → `apps/web/src` in `remotion.config.ts` |
| Tailwind v4 utilities | `@tailwindcss/postcss` | ❌ Not auto | Installed `@remotion/tailwind-v4`, called `enableTailwind(config)` |
| Tailwind v4 class scanning | Tailwind auto-source | ❌ Not auto | Two `@source` rules in local `globals.css` (one for the experiment dir, one for `apps/web/src`) |
| Design tokens (`--brand-primary-500` etc.) | `apps/web/src/app/globals.css` | ✅ via `@import` from local globals.css | none — just a re-import |
| `@base-ui/react` (shadcn backing primitives) | `Button`, `Badge`, `Dialog`, `Tabs`, etc. | ✅ Renders perfectly via `useRender` | none |
| `class-variance-authority` | CVA variants | ✅ | none |
| `lucide-react` icons | SVG icons | ✅ | none |
| `tailwind-merge` + `clsx` (`cn()`) | utility | ✅ | none |
| `react-resizable-panels` | Resizable panel groups | ✅ Renders the 40/60 split correctly | none |
| `react` 19 | React Server Components | ⚠️ Components are `"use client"` already, so they render fine in Remotion | none — but if any were RSC-only it would have blocked us |
| `next/link` | client-side router | ❌ | 16-line stub returning plain `<a>` |
| `next/navigation` (`useRouter`, `useParams`, `usePathname`) | router hooks | ❌ | 34-line stub returning no-ops |
| `next/font/google` (Inter) | font loader | ❌ Not loaded | Not shimmed — headings fall back to system serif. Fix would be a `<link>` to Google Fonts in the Remotion HTML head. |
| `next/image` | optimized image | n/a — evidence-pane already uses raw `<img>` for blob URLs | none |
| `firebase` (auth) | client SDK + module-level `initializeApp` | ❌ Crashed at bundle time | 8-line stub for `@/lib/firebase` returning `{ auth: { currentUser: null } }` |
| `@/lib/api/claims` (fetch + auth) | wrapped fetch with Firebase ID token | ❌ Would actually call the BFF | 54-line stub: `fetchEvidenceBlob → null`, types re-exported as `any` |
| `@/lib/api/auth` (same shape) | same | ❌ | Aliased to the same stub |
| `@/store/*` Zustand stores | 6 stores | ❌ Real ones import `firebase` + `@claimit/mongodb-types` | 75-line mock — fake stores with selector support, fixed initial state, no-op setters |
| `@/hooks/useConversations` | SSE conversation fetcher | ❌ Would call API | 46-line stub returning `{ conversations: [], isLoading: false, … }` |
| `@/hooks/useAssistantStream` | SSE streaming | ❌ Would open EventSource | Same stub — `{ messages: [], streaming: false, … }` |
| `@/hooks/use-media-query` | window listener | ❌ Would need `matchMedia` | Same stub — returns `true` (assume desktop) |
| `@/components/assistant/markdown-message` | `react-markdown` + `remark-gfm` | ✅ Works if installed, but no-op shim was simpler | 16-line stub returning `<div>{content}</div>` |
| `@claimit/mongodb-types` (workspace pkg) | TS types only | ❌ Workspace pkg not installed in this project | 15-line stub of `string`/`any` types |
| `sonner` toast | toast UI + portal | ✅ Installed cleanly but shim was simpler for stills | 25-line no-op stub |
| `recharts` (price chart) | **not tested** | n/a — the three-pane shell doesn't import it. Price chart lives in `/purchases/[id]`, not `/claims/[id]`. | Untested. ResizeObserver could be an issue in headless. |
| `motion@12` (Framer successor) | landing animations + FAB | n/a — none of the claims components import it | none |
| `react-day-picker` / `react-dropzone` | calendar / dropzone | n/a — not in the shell | none |

### Stuff that "just worked" once the alias + Tailwind pipeline was wired

- Every shadcn primitive (`Button`, `Badge`, `Card`, `Dialog`, `Tabs`, `ScrollArea`, `Skeleton`, `Alert`, `Tooltip`, `DropdownMenu`, `Input`, `Textarea`, `RadioGroup`, `Label`, `Separator`)
- All Lucide icons in their actual sizes/colors
- `react-resizable-panels` (the 40/60 horizontal + 60/40 vertical splits render perfectly without a hand-rolled flex fallback)
- All design tokens from `globals.css` — brand navy, semantic amber/red, neutrals
- CVA variants — Button `destructive`/`outline`/`ghost`/`default`, Badge variants
- Tailwind `tabular-nums`, `font-mono`, `text-2xl`, every utility
- The actual draft email body rendering with `whitespace-pre-wrap`
- The amber blockquote with `border-l-4 border-semantic-warning`
- `useEffect` / `useState` — `EvidenceScreenshot`'s effect ran and resolved to the "missing" placeholder before the still was captured

That's a lot of fidelity coming for free.

---

## 3. Glue-code accounting

```
remotion.config.ts            75 lines   (webpack alias map + Tailwind wiring)
src/shims/api-claims.ts       54
src/shims/firebase.ts          8
src/shims/hooks.ts            46
src/shims/markdown-message.tsx 16
src/shims/mongodb-types.ts    15
src/shims/next-link.tsx       16
src/shims/next-navigation.ts  34
src/shims/sonner.tsx          25
src/shims/stores.ts           75
src/globals.css               20   (re-imports apps/web globals + @source rules)
src/mock-data.ts              52   (Apple AirPods Pro ClaimDetail object)
──────────────────────────────────
Total one-time glue          436 lines
```

For the actual compositions (Stage0–3) on top of this: ~100 lines (mostly `<Composition>` registrations and a thin wrapper that passes mock props to the real component).

**Important: this number doesn't grow proportionally with new compositions.** It grows when:
- A new component is imported that hits a new hook/store we haven't shimmed yet (cheap — add a method to `hooks.ts` or `stores.ts`)
- A new external dep is added to the product (e.g., if `motion@12` starts being used in claims components, we'd need to disable/shim it because Remotion uses its own frame model)

A second composition that reuses the same components costs ~10 lines (just register it in `Root.tsx` and pass different props).

---

## 4. Pain points + surprises

Things that bit me, ordered by how much time they cost:

1. **`__dirname` is unreliable in `remotion.config.ts`.** Remotion `eval`s the config from inside its own CLI module, so `__dirname` points at the CLI dir, not the project. `process.cwd()` works.
2. **Webpack alias is order-sensitive** in array form and longest-prefix in object form, *but* `enableTailwind()` returns object form which lost my `onlyModule: true` flag. Had to switch to `$` exact-match suffix to keep `@/store/claim-assistant-prompt` from being prefix-matched by `@/store`.
3. **Tailwind v4 only emits utilities for class names it scans.** Without `@source` directives in my local `globals.css`, only the apps/web tree was scanned and any class I added in `Stage1.tsx` (e.g. `bg-primary`) was silently dropped. Tailwind doesn't warn — utilities just don't exist in the bundle.
4. **Hook return shapes drift.** First version of my `useConversations` stub returned `{ messages }`; the real consumer destructures `{ conversations, isLoading, error, refetch, createConversation }`. Got a "Cannot read property 'length' of undefined" at runtime. Cost one iteration. This is brittle — any prop shape change in the real hooks will break the shim until updated.
5. **Inter font doesn't load.** `next/font/google` is a Next-only mechanism. Headings render in system serif (Times). Easy fix: add `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter…">` to Remotion's `<head>` via a config option or a global CSS import. Not done in this experiment.
6. **`useEffect` with async data still works for stills.** Remotion gives effects a chance to settle before capturing the frame, so my `fetchEvidenceBlob → null` shim correctly drives the `EvidenceScreenshot` into its "missing" state before the screenshot is taken.

Things that didn't bite me but might in production:
- **`ResizeObserver` for `recharts` / `react-resizable-panels` in headless.** The resizable panels worked — they read parent dimensions, not `ResizeObserver`. But if a future composition imports the price chart, we may need a `ResizeObserver` polyfill in `disable-web-security` mode.
- **Motion@12 in the same frame as Remotion's `useCurrentFrame`.** None of the claims components import motion, so we didn't hit this. If we animate the email pane or the assistant typewriter, we use Remotion's `interpolate`, not motion. Components that ship internal motion-driven UI would need to be neutralized or replaced.

---

## 5. Studio behavior

Started `npx remotion studio` on port 4321. Built the bundle in 2.4s after a code change. Served `200 OK` on the studio root. Did not crash. The HTML page lists all four compositions (Stage0–3) as registered. I did not visually verify the live preview through a browser since this is a headless terminal session — but the bundle is the same bundle the still renderer used, so it would render identically.

Hot reload is the meaningful difference between Studio and `npx remotion still`: iterating on `mock-data.ts` props would be live-feedback in Studio.

---

## 6. Verdict

### 🟡 YELLOW, with a strong lean toward Remotion

**Why not full GREEN:**
- The 436-line glue layer is real one-time work. Brittle to component-tree changes (every new hook/store import in `claims/` needs a stub).
- Inter font fidelity issue (minor).
- The shim layer abstracts away real behavior — anything you want to demonstrate that depends on a real fetch, a real Firebase user, or a real SSE stream needs more work than HyperFrames would (where you'd just type the result you want).

**Why not RED:**
- Reuse worked at every stage. Including the most-entangled component (`claim-detail-shell.tsx` — 535 lines, 6 stores, 3 hooks, 6 dialogs, react-resizable-panels). The screenshot in `out/stage-3.png` is the actual product, not an approximation.
- The dependency entanglement was **mechanical**, not architectural. RSC was not a blocker (the components are already `"use client"`). Next-only APIs (`next/link`, `next/navigation`, `next/font/google`) each have small, local stubs. No deep "you can't render this without a real backend" wall.
- 436 lines of glue is significant but it's a one-time cost. The 4th composition costs ~10 lines, not ~110.

### My honest engineering recommendation

**Switch to Remotion for compositions that mirror the product UI.** That's the storyboard's beats 6.1 (inbox→dashboard), 6.2 (extraction confirm), 6.5 (three-pane review), 6.6 (assistant zoom), 6.7 (approve flow), and any future "show the real ClaimIt UI" beats. Importing the real components gives us pixel-fidelity for free and keeps the demo aligned with the product as the product evolves — a HyperFrames hand-built HTML mirror has to be re-edited any time the product changes.

**Keep HyperFrames if it's already further along for typographic / non-product beats** — the storyboard sections 6.4 (four-types typography), ⑦ (Reach wall), ②/③/④/⑤/⑧ (pure type cards). These don't reuse product components and don't benefit from Remotion's strength. Switching tools mid-storyboard would mean re-doing work that's already animation-locked in GSAP.

**Suggested split:**
- HyperFrames: anything you've already shipped that doesn't depend on the real product UI.
- Remotion: any not-yet-built composition that needs to look like the actual app. Spend an hour copying these shims to set the project up cleanly, then build new compositions on top.

**If forced to pick one tool:** Remotion. The reason is that the demo's narrative is built around "watch the real product do this" beats, and HyperFrames will require hand-rebuilding the product's three-pane layout for every product-y beat. Remotion does that work once (this experiment) and reuses it. The 436-line investment amortizes after about three product-mirroring compositions.

### What would change my mind to GREEN

- A real composition (not a still) of beat 6.5 with the email draft typewriter-animating in, the approve button highlighting, and the post-approve banner sliding down — using `useCurrentFrame` + `interpolate` over the imported components. If that's also ~10 lines on top of Stage 3, the verdict is unambiguously GREEN.
- The 436-line glue layer holding stable over a week of product changes without needing a single update.

### What would change my mind to RED

- Discovering that one of the storyboard's required beats hits a component that imports `motion@12` internally and the motion timeline fights Remotion's frame model.
- Discovering that the price chart in `/purchases/[id]` (recharts) refuses to render in headless without a 200-line ResizeObserver shim.

Neither of those was tested in this experiment.

---

## Changelog
- 2026-05-31 — Initial verdict after Stage 0–3 + Studio test. Glue-code total: 436 lines.
