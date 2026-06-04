# ClaimIt — Frontend & Workflow Audit v1

> **Purpose**: Ground the demo-video script (BEAT_SHEET v3) in what the product
> *actually* does. Every claim below cites a real file. Where BEAT_SHEET v3
> describes something the product doesn't do, it's flagged — not glossed.
> **Method**: Read of `apps/web/` (Next.js 16 / React 19 / Tailwind v4 + shadcn-on-base-ui),
> the 7 backend services in `apps/`, `seed/policies/`, and `packages/shared/fixtures/`.
> **Date**: 2026-06-03 · **Author**: Claude Code · **Status**: v1 (for team review)

---

## 0. TL;DR — read this first

ClaimIt is **real and deep**, not a logo-skin. It's a 7-service, event-driven,
Google-Cloud-native multi-agent system. The hero refund flow (receipt → extract →
monitor → policy check → draft → approve) is genuinely implemented end-to-end and
maps cleanly onto the demo. **Five things in BEAT_SHEET v3 don't match reality and
need a decision before VO lock:**

| # | Flag | Beats affected | Severity |
|---|---|---|---|
| F1 | **Best Buy & Target are `chat_script` claims, not email.** The refund demo's "drafts the email → sends the claim" narrative doesn't match the hero retailer's real claim channel. | 17, 21, 30 | 🔴 high |
| F2 | **No Apple Watch fixture; Apple isn't a mapped retailer; no card-issuer price-protection mechanism exists.** Price-protection section is currently unfilmable from real UI. | 22–25 | 🔴 high |
| F3 | **No points / rebates feature exists** anywhere in the codebase. | 26–28 | 🟠 med |
| F4 | **MCP wording**: agents *read* through MongoDB MCP (read-only); state *writes* go direct via Motor. "Stores every claim state through MCP" is misleading. | 33 | 🟠 med |
| F5 | **Frontend reads live `api-gateway` data — no local mocks.** Nothing is filmable without a running, seeded stack (or rebuilding UI as Remotion shims). | all demo UI | 🟠 med (production) |

Everything else in the refund demo (beats 10–16, 18–20) is accurate or a one-word tweak.

---

## 1. Screen inventory

Routes under `apps/web/src/app/`. Route groups: `(public)` marketing, `(public-auth)`
login, `(onboarding)`, `(authenticated)` the app. No `route.ts` files — the web app
calls the **`api-gateway`** service, not Next API routes.

| Route | File | Purpose | In demo? |
|---|---|---|---|
| `/dashboard` | `(authenticated)/dashboard/page.tsx` | Overview: "Needs your attention" cards, monitored-purchases table, recent activity, money reclaimed | ✅ overview / B-roll |
| `/claims` | `(authenticated)/claims/page.tsx` | Claims list (status chips + search; table desktop / cards mobile; outcome badges) | ✅ B-roll |
| `/claims/[id]` | `(authenticated)/claims/[id]/page.tsx` → `claim-detail-shell.tsx` | **The 3-pane approval surface** (Draft / Evidence / Assistant) | ✅✅ **hero** (beats 17–21) |
| `/purchases` | `(authenticated)/purchases/page.tsx` | Monitored purchases list | ⬜ optional |
| `/purchases/[id]` | `(authenticated)/purchases/[id]/page.tsx` | Purchase detail: price-history chart, eligibility/window countdown, monitoring status | ✅ beats 14–15 |
| `/confirm/[purchaseId]` | `(authenticated)/confirm/[purchaseId]/page.tsx` | Confirm extracted fields after upload (receipt preview + editable form) | ✅ beats 12–13 |
| `/assistant/[[...conversationId]]` | `(authenticated)/assistant/...page.tsx` | Standalone conversational assistant (RAG + claim reasoning) | ⬜ optional |
| `/notifications` | `(authenticated)/notifications/page.tsx` | Notification feed | ⬜ optional |
| `/settings/*` | `(authenticated)/settings/{,gmail,account,billing,preferences,notifications}` | Settings incl. **Gmail connect** (needed for email send) | ⬜ (Gmail connect maybe) |
| `/onboarding/*` | `(onboarding)/onboarding/{,gmail,preferences}` | First-run | ⬜ |
| `/`, `/how-it-works`, `/pricing`, `/security`, `/team`, `/blog`, `/careers`, `/changelog`, `/privacy`, `/terms` | `(public)/...` | Marketing site (incl. `/team` for credits) | `/team` maybe for credits |
| `/login`, `/login/verify` | `(public-auth)/login/...` | Firebase email-link auth | ⬜ |
| `/help`, `/help/contact` | `help/...` | Help | ⬜ |

**Upload** is not a route — it's a **global modal** (`components/upload/upload-dialog.tsx`)
launched from the dashboard/sidebar, which navigates to `/confirm/...` on success.

---

## 2. Real user workflow (email arrival → claim sent)

Two entry points feed one pipeline. Citations are `path` (line where useful).

### 2.1 Ingestion (what enters)
1. **Email path** — Gmail push → Pub/Sub topic `gmail-inbound` → `apps/ingest-agent/src/main.py:632` `handle_gmail_inbound()` (OIDC-verified push, `auth.py:verify_pubsub_oidc`). Gmail history is pulled, messages classified + parsed (`gmail_parser.py`).
2. **Upload path** — user drops a receipt in `components/upload/upload-dialog.tsx` → `POST` via `lib/api` → api-gateway publishes `purchase.uploaded` → `apps/ingest-agent/src/main.py:775` `handle_purchase_uploaded()` (reads blob from GCS).

### 2.2 Extraction (OCR/parsing) — **Gemini multimodal, no Tesseract/Vision**
3. `apps/ingest-agent/src/extractor.py` runs a **Google ADK** `Agent` on **`gemini-2.5-flash`** (`extractor.py:61`). Vision path `extract_from_blob()` (`:579`) handles PDF/PNG/JPEG natively; email path uses normalized text. Output is the Pydantic `ExtractedPurchaseFields` (`:273`) with per-field confidence.
4. A purchase doc is written to MongoDB `purchases` (status `pending_confirmation` → `pending_user_edit`), via `finalize.py` (direct Motor driver, not MCP).

### 2.3 User confirms extraction (frontend)
5. `/confirm/[purchaseId]` (`components/confirm/extraction-review-form.tsx`) shows the extracted **platform (merchant), product, price, date, order id, category**, with `ConfidenceBanner` (amber/red) on low-confidence fields and a `WindowWarningBanner` if outside the claim window. "Confirm" `POST`s the real purchase; status → `monitoring`.

### 2.4 Monitoring (price + window) — scheduled
6. Cloud Scheduler job `claimit-monitor-cron` (every 15 min, `infra/terraform/scheduler.tf:46`) hits `POST /cron` → `apps/monitor-agent/src/cron.py:run_cron()`. It scans `status == "monitoring"` purchases, computes adaptive cadence, and fetches current prices via **platform adapters** (`apps/monitor-agent/src/adapters/` — only **`best_buy.py`, `target.py`**, plus `seeded.py` for fixtures).
7. **Policy/eligibility is data-driven** from the MongoDB `policies` collection (`apps/monitor-agent/src/eligibility.py:validate_eligibility()`): window expiry, `covers_own_drops`/`covers_competitor_drops`, member-tier windows. On a qualifying drop it publishes `price.dropped`.

### 2.5 Draft generation — **Gemini ADK, 4 claim types**
8. `apps/claim-agent/src/main.py:147` `handle_price_dropped()` → `plan.py:plan_claim()` picks a claim type from `policy.claim_type`, then a generator in `apps/claim-agent/src/draft/`:
   - **`type_a_email.py`** (email), `type_b_chat.py` (chat script), `type_c_in_store.py` (in-store guide), `type_d_self_service.py` (self-service walkthrough). Model: `gemini-2.5-flash` (`draft/_shared.py:18`). Drafts use placeholder tokens (`{{ORDER_ID}}`, `{{REFUND_AMOUNT}}`, `{{POLICY_CITATION}}`…).
9. During reasoning, agents **read** Mongo/ES **through MCP** (read-only): `packages/shared/mcp/claimit_mcp/mongodb.py` (`get_mongodb_mcp_toolset`, Streamable-HTTP to a Cloud-Run-hosted `mongodb-mcp-server`, OIDC), and `…/elastic.py`, `…/phoenix.py`. Writes do **not** go through MCP.

### 2.6 Human approval gate (frontend → backend)
10. `/claims/[id]` `claim-detail-shell.tsx` shows the 3-pane review. User edits/rewrites/approves. Approve → `POST /api/v1/claims/{id}/approve` (`apps/api-gateway/src/routes/claims.py:153`) → publishes `claim.approved`.

### 2.7 Send
11. `apps/claim-agent/src/submit_claim.py:submit_claim()`. **Email** claims send via **Gmail Send API** (`claimit_gmail.gmail_send()`, user refresh token from Secret Manager). **Auto mode** sends after a countdown via Cloud Scheduler (`claim-auto-send`, every 1 min); **approval mode** sends on click. **Chat / in-store / self-service** claims are *not* auto-sent — the user is handed the script/guide/link (post-approve banner).

### 2.8 Observability (cross-cutting)
12. Every service calls `init_phoenix(...)` (`packages/shared/observability/`) → OTLP traces to Arize Phoenix. A dedicated **`phoenix-mcp`** service lets agents *read their own recent traces* at runtime (`…/phoenix.py`). This is a genuine judge bonus.

### 2.9 Tech-stack grounding (all verified real)
| Tech | Where | Real? |
|---|---|---|
| Gemini `gemini-2.5-flash` | ingest/claim/assistant agents | ✅ |
| Google ADK (`from google.adk import Agent`) | all agents | ✅ |
| Pub/Sub (8 topics + DLQs) | `infra/terraform/pubsub.tf` | ✅ |
| Cloud Run | `infra/terraform/modules/cloud-run-agent/` | ✅ |
| Cloud Scheduler (monitor 15m, gmail-renew daily, auto-send 1m) | `scheduler.tf` | ✅ |
| MongoDB Atlas (Motor) — `purchases, claims, users, policies, price_history, …` | all services | ✅ |
| MongoDB MCP (read-only, Streamable-HTTP, Cloud Run) | `claimit_mcp/mongodb.py`, `mongodb_mcp.tf` | ✅ (reads only) |
| Elasticsearch + ES MCP (sync-worker mirrors via change streams) | `sync-worker`, `claimit_mcp/elastic.py` | ✅ |
| Arize Phoenix + Phoenix MCP | `observability/`, `phoenix-mcp/` | ✅ |

---

## 3. Design system summary

Source of truth: `apps/web/src/app/globals.css` (PROJECT_BRIEF §6: reuse these tokens,
never hardcode). **Two-layer color model**: (a) shadcn neutral primitives in **OKLCH
grayscale** for base chrome, (b) ClaimIt **brand tokens in HSL** for emphasis.

### 3.1 Color (exact, from `globals.css`)
| Token | Light value (HSL) | ~Hex | Use |
|---|---|---|---|
| `brand-primary-500` (Navy) | `hsl(217,50%,30%)` | ~`#264f99` | brand structure |
| `brand-primary-700` | `hsl(217,70%,17%)` | ~`#0d2a4a` | deep nav / headers |
| `brand-primary-900` | `hsl(217,80%,9%)` | ~`#06182e` | darkest |
| **`brand-accent-500` (Green)** | `hsl(142,65%,32%)` | ~`#1c8745` | **"RECLAIMED MONEY ONLY"** (literal comment in source) |
| `semantic-success` | = `brand-accent-500` | green | money back / approved |
| `semantic-warning` | `hsl(35,90%,50%)` | ~`#f29d0c` | attention / pending / degraded |
| `semantic-danger` | `hsl(0,70%,50%)` | ~`#d92626` | denied / errors |
| `semantic-info` | `hsl(210,90%,55%)` | ~`#2596f0` | "submitted" banners |
| `neutral-0 … 900` | `hsl(220, …)` cool navy-tinted | white → ~`#10131a` | text/surfaces |
| shadcn `--primary` (light) | `oklch(0.205 0 0)` | ~`#1f1f1f` charcoal | **default buttons** (NOT navy) |
| shadcn `--background` | `oklch(1 0 0)` | `#fff` | page bg |

**Key takeaways for the video:**
- The product's palette is **restrained**: grayscale/charcoal base chrome, navy for structure, **green reserved exclusively for "money reclaimed."** This is the single strongest brand signal — *green = you got money back.* Use it the same way in the film.
- Default CTA buttons are **charcoal**, not blue. "Blue" surfaces are navy brand accents (e.g. proactive card `bg-brand-primary-50` / `border-brand-primary-200`).
- Subtitle orange `#FFA500` ≈ `hsl(38,100%,50%)` sits right next to the app's `semantic-warning` amber `hsl(35,90%,50%)` → reads as "highlight/attention," and notably **is *not* the brand's money-green.** Harmless for an overlay, but worth knowing it doesn't echo a brand color (see §4 / Bible conflict).
- Full **dark mode** exists (brand lifted ~30%, neutrals inverted). Default theme = `system` (`layout.tsx`).

### 3.2 Typography
- **Inter** via `next/font/google` (variable, `display: swap`, `--font-sans`); `font-heading` = same Inter. Stylistic sets on `body`: `"cv11","ss01","ss03","cv02"`.
- The app is a **dense dashboard**, not big-type: base `text-sm` (14px); labels `text-xs` (12px); `CardTitle` `text-base` (16px) `font-medium leading-snug`; prominent numbers `text-2xl` `font-semibold tabular-nums`; **amounts & order IDs in `font-mono`**.
- ⚠️ This is the *opposite* of the Bible's cinematic scale (hero 120–160px). Mirror the app's compact type **only inside recreated product UI**; use the Bible's big scale for narration/hero frames.

### 3.3 Cards / buttons / inputs / badges (exact)
- **Radius base** `--radius: 0.625rem` (**10px**). `radius-lg`=10px, `radius-xl`=14px, `radius-4xl`=26px.
- **Card** (`ui/card.tsx`): `rounded-xl` (**14px**), `bg-card`, **`ring-1 ring-foreground/10`** (a hairline 10%-opacity ring — *no heavy shadow/border*), `py-4 px-4 gap-4`, `overflow-hidden`. Footer: `border-t bg-muted/50`. → clean Linear/Vercel-grade surfaces.
- **Button** (`ui/button.tsx`, base-ui primitive): `rounded-lg` (**10px**), `text-sm font-medium`, **compact** heights (default `h-8`/32px, sm `h-7`, xs `h-6`, lg `h-9`), `transition-all`, **press = `active:translate-y-px`** (1px nudge). Variants: `default` (charcoal), `outline`, `secondary`, `ghost`, `destructive` (soft), `destructiveSolid`, `link`.
- **Badge** (`ui/badge.tsx`): **fully-rounded pill** `rounded-4xl`, `h-5` (20px), `px-2 py-0.5 text-xs font-medium`. Status pills everywhere (`claim-outcome-badge.tsx`).
- **Input/Select/Textarea**: shadcn standard; textarea for draft edit is `font-mono min-h-80`.

### 3.4 Motion conventions
- Libraries: **`motion`** (Framer Motion) for component micro-interactions; **CSS keyframes** in `globals.css` for ambient: `marquee` (90s linear), `shimmer` (1.5s), **`breathe`** (scale 1→1.04, 2.8s ease-in-out), **`ring-pulse`** (2.5s, `cubic-bezier(0.16,1,0.3,1)`), `pulse-dot` (1.4s). `prefers-reduced-motion` fully respected.
- 🎯 **`ring-pulse` uses `cubic-bezier(0.16,1,0.3,1)` — byte-for-byte the Bible's `easeOut`.** The product and the film already share an easing language. The "breathe" + "pulse-dot" are the app's *"agent is working / live"* idiom — recreate frame-driven equivalents for the same feel.
- ⚠️ For the Remotion film, **do not import `motion`/CSS animations** (Bible §IX forbids). These are *style references* to reimplement via `useCurrentFrame()`.

---

## 4. Gap analysis — BEAT_SHEET v3 vs reality

For each gap: **(a)** reword BEAT_SHEET, **(b)** build a new mockup, or **(c)** reuse an Erdun shim from `src/_archive/erdun_shots_v1/`.

### G1 — Best Buy/Target claim channel is `chat_script`, not email 🔴 (beats 17, 21, 30)
`seed/policies/best_buy.json` and `target.json` both have `"claim_type": "chat_script"`.
The refund demo says Gemini "drafts the **email**" (17) and "ClaimIt **sends** the claim" (21),
and credibility beat 30 says "Best Buy and Target are live today, through **email-based claims**."
In reality, for Best Buy the draft pane renders a **chat script** (numbered, paste-into-chat steps,
per-step Copy buttons) and the post-approve banner says *"Use the per-step Copy buttons… Open Best Buy chat."*
Auto-send via Gmail only happens for **`email`-type** retailers (17 of 26; e.g. Costco, Macy's, Dell, Nordstrom, Marriott).
- **Decision needed (pick one):**
  - **(a-1) Switch the hero refund retailer to an `email` type** (keep the Sony headphones product, move it to e.g. **Costco** [email, retail, 30-day, covers_own_drops] or **Dell/Macy's/Nordstrom**). Pro: the "drafts email → sends from Gmail" story becomes 100% true. Con: not "Best Buy" (brief locked Best Buy); needs the `seeded` adapter for the drop (fine for demo).
  - **(a-2) Keep Best Buy, reword to the chat-script reality**: 17 → "Gemini drafts the **claim** with the right context."; 21 → "ClaimIt hands you the exact script to paste — one click per step." Pro: honest, still impressive, keeps Best Buy. Con: less "magical" than auto-send.
  - **(c) Change `best_buy.json` to `claim_type: "email"`** (a data edit). Pro: keeps both Best Buy *and* the email/auto-send story. Con: least truthful (Best Buy's real channel is chat/self-service); judges who probe could notice.
- **Recommendation**: **(a-2)** for honesty, or **(a-1)** if "drafts + auto-sends an email" is non-negotiable. Also fix beat 30 → "Best Buy and Target are live today" (true: only these two have price adapters) **without** "email-based" (or say "email and chat-based claims").

### G2 — Apple Watch price-protection has no fixture / no mechanism 🔴 (beats 22–25)
No Apple Watch fixture (confirmed absent), **Apple is not among the 26 retailers**, and there is
**no card-issuer price-protection mechanism** in the code — all `seed/policies/*` are *merchant*
price-match policies (`covers_own_drops` / `covers_competitor_drops`), not credit-card price protection.
Beat 24 ("ClaimIt prepares the **card issuer** claim") describes something the product doesn't do.
- **Options**: **(b)** build a mockup fixture + screens for an Apple-Watch card-issuer claim (and label the section as a *concept extension*, not "live"); **or (a)** reframe "price protection" as what the product *actually* does — a **merchant** price-drop refund (which is the same engine as the refund demo, just a different framing) using a real `email`-type retailer fixture; **or** cut beats 22–25.
- **Recommendation**: decide with user. If keeping Apple Watch, it's a **mockup** (label honestly). Cleanest truthful option: make "price protection" a *second merchant example* (different retailer, same engine) and drop "card issuer."

### G3 — Points / rebates not implemented 🟠 (beats 26–28)
No points-expiry or rebate-discovery feature exists (not in stores, components, agents, or schema).
Beats 26–28 ("watches expiring points," "finds rebate offers buried in email") are aspirational.
- **Options**: **(b)** mockup framed explicitly as *"the same workflow extends to…"* (future-tense, no claim it's shipped); **or (a)** cut to keep the film honest for an engineer audience.
- **Recommendation**: keep only if framed as a roadmap concept with a visibly conceptual treatment.

### G4 — MCP "stores every claim state through MCP" 🟠 (beat 33)
Agents **read** via the **read-only** MongoDB MCP server; service code **writes** state directly via Motor (`finalize.py`, `submit_claim.py`, api-gateway). A readwrite MCP service exists in the design but the agent path is read-only.
- **(a) reword** → e.g. "Agents query claim state and policy through the **MongoDB MCP** server" or "Every claim's state lives in **MongoDB Atlas**; agents reach it through MCP." Don't say writes go through MCP.

### G5 — Frontend has no mock data; it reads live `api-gateway` 🟠 (production/all UI)
`lib/api/{claims,purchases,dashboard}.ts` call the real backend with a Firebase token; there is no local fixture fallback. **Nothing is screen-capturable without a running, seeded stack.**
- **Options**: **(b)** stand up the full stack + seed (`seed/`) and screen-capture, **or (b/c)** rebuild the demo surfaces as **Remotion shims** fed by `packages/shared/fixtures/*` (Bible's `src/shims/` approach; reuse Erdun's archived shims where shape matches).
- **Recommendation**: **shims** for control/repeatability (matches Bible + avoids flaky live capture), with optional real-capture B-roll for authenticity.

### Minor wording nits
- **Beat 11** "Upload a photo, a PDF, or an **email** receipt." ⚠ The upload dialog accepts **PDF/PNG/JPG only** ("PDF, PNG, or JPG up to 10 MB"). Email receipts arrive via the **Gmail auto-ingestion** path, not the uploader. Reword → "Upload a photo or a PDF — or let ClaimIt read it **straight from your inbox**."
- **Beat 13** "merchant" = the `platform` field (enum). Fine as "merchant" on screen.

---

## 5. Reusable components (for the Remotion shim layer)

> These are **visual templates to recreate as shims**, not importable React (they depend on
> next/font, base-ui, zustand, live API). Build static Remotion versions fed by
> `packages/shared/fixtures/*`. "Repr." = what the viewer sees.

| Component (path under `apps/web/src/components/`) | Repr. (rebuild as shim) | Best for beats |
|---|---|---|
| `claims/claim-detail-shell.tsx` | **3-pane shell**: Draft 40% (resizable) ∣ Evidence 60% + Assistant 40% | 17–21 (hero) |
| `claims/draft-pane.tsx` | Draft with **Preview/Edit tabs**, **version dropdown** ("v3 of 5 · You edited"), Copy; email **or** chat-script render | 17, 19 |
| `claims/evidence-pane.tsx` | **Current-price card** (TrendingDown, paid vs current, "-$X.XX", screenshot), **policy card** (highlighted clause blockquote), original-purchase card | 13–16 |
| `claims/assistant-pane.tsx` | Chat bubbles + Sparkles + quick actions **"Make it friendlier"**, "Why this template?", "Explain the policy match" | 18 |
| `assistant/proactive-card.tsx` | Floating navy card: *"Your Best Buy item just dropped $X. You have N hours left — want me to file it?"* + quick actions | 15 (price-drop "catch") |
| `upload/upload-dialog.tsx` | Dashed dropzone, UploadCloud icon, *"Drag a receipt here"*, *"PDF, PNG, or JPG up to 10 MB"*, "Browse files" | 10–11 |
| `confirm/extraction-review-form.tsx` (+ `confidence-banner.tsx`) | Extracted fields (platform/product/price/date/order id) with amber/red low-confidence highlights | 12–13 |
| `purchase/price-history-chart.tsx` | **recharts** line chart: paid-price reference line, current-price callout, drop | 14–15 |
| `purchase/refund-eligibility-card.tsx` | Window countdown ("**N days remaining**", "Window expires {date}") | 14 |
| `dashboard/auto-send-banner.tsx` | Amber row **"Sending {platform} claim in MM:SS"** + Review / Send now / Cancel | 21 (if email/auto) |
| `dashboard/hero/*` + monitored-purchases table | Money-reclaimed hero stat, status badges (Active/Paused/Expired) | dashboard B-roll |
| `claims/claim-outcome-badge.tsx` / `ui/badge.tsx` | Status pills (Draft/Pending/Approved=green/Denied) | lists |

---

## 6. Mockup-needed list (no real, filmable UI exists)

1. **Cold-open hook visuals** (beats 1–3): money slipping through cracks, "2 of 100" stat — pure motion, no UI.
2. **Architecture diagram** (beats 5–9): the inbox/upload → Gemini → MongoDB → agent(policy/window) → draft → approval → Gmail → Phoenix flow. *(PROJECT_BRIEF open item: "白板手绘 vs 工程仪表板" style.)*
3. **Agent reasoning / "thinking" beat**: the assistant pane is the closest real surface, but a dramatized reasoning-chain (policy match → window → draft) is video-only.
4. **MongoDB MCP visualization** (beat 33, judge bonus #1): "agent reads claim/policy via MCP" — there's no UI for this; needs a designed graphic (keep it read-accurate per G4).
5. **Phoenix trace view** (beat 34): real screenshot vs redrawn mockup — *PROJECT_BRIEF open item.* A redraw is safer/cleaner.
6. **Apple Watch price-protection** (beats 22–25): entire fixture + screens — **does not exist** (see G2). Mockup if kept.
7. **Points / rebates** (beats 26–28): entire concept — **does not exist** (see G3). Mockup if kept.
8. **Sony headphones receipt image**: the fixture has *data* but no actual receipt image asset for the upload preview — need a designed receipt.
9. **"Price-drop caught" moment**: `price-history-chart` exists, but the dramatized catch (line dips, agent pings) is a video composition.
10. **Payoff / tech-wall** (beats 31–36): "Powered by Gemini ADK · MongoDB Atlas · Arize Phoenix" + team — designed end card.

---

## 7. Architecture VO draft (beats 5–9 · 0:20–0:50)

Leo, native speed; 10–15 words each (~4–5s + ~1s buffer). Preferred vocabulary only;
no forbidden phrases. Grounded in §2. Arc: **input → extraction → store+monitor →
decide+draft → approve+trace (bridge)**.

| Beat | Time | VO (EN) | Grounded in |
|---|---|---|---|
| 5 | 0:20–0:26 | "A receipt reaches ClaimIt — forwarded from your inbox, or uploaded by hand." | Gmail push + receipt upload (§2.1) |
| 6 | 0:26–0:32 | "Gemini reads it and pulls out the merchant, item, date, and price." | Gemini multimodal extraction (§2.2) |
| 7 | 0:32–0:38 | "It's stored in MongoDB, and an agent watches the price and the claim window." | MongoDB + monitor-agent + scheduler (§2.4) |
| 8 | 0:38–0:44 | "When a drop clears the policy, the agent drafts the claim for you." | eligibility (policies) + ADK draft (§2.5) |
| 9 | 0:44–0:50 | "You approve it — and every decision, tool call, and draft is traced." | approval gate + Phoenix (§2.6, §2.8) → bridges to demo |

**中文 reference (not rendered):**
5 「一张收据进入 ClaimIt —— 从你的收件箱转发，或手动上传。」
6 「Gemini 读取它，提取商家、商品、日期和价格。」
7 「它被存进 MongoDB，一个 agent 盯着价格和申请窗口。」
8 「当降价符合政策时，agent 替你起草这份 claim。」
9 「你批准它 —— 每一次决策、工具调用和草稿都被追踪。」

**Alt for beat 9** (if you'd rather name the stack here and bridge separately):
"Gemini ADK reasons, MongoDB holds the state, Phoenix traces it all." (then a held bridge frame). Note this overlaps Implementation Proof (31–35) — keeping 9 as the approval+trace bridge avoids duplication.

---

## 8. Refund Demo VO sanity check (beats 10–21)

Legend: ✓ matches real UI · ⚠ slight mismatch (minimal tweak) · ❌ no such UI / wrong channel.
**Counts (Best Buy as hero): ✓ 9 · ⚠ 1 · ❌ 2.** The two ❌ both stem from **G1** (Best Buy = chat_script).
*If the hero becomes an `email`-type retailer (G1 option a-1), beats 17 & 21 flip to ✓.*

| Beat | VO | Verdict | Note / tweak |
|---|---|---|---|
| 10 | "It starts with a receipt." | ✓ | upload-dialog / ingestion |
| 11 | "Upload a photo, a PDF, or an email receipt." | ⚠ | uploader = PDF/PNG/JPG; email = Gmail path → "Upload a photo or a PDF — or let ClaimIt read it from your inbox." |
| 12 | "ClaimIt pulls out the details for you." | ✓ | Gemini extraction → confirm form |
| 13 | "The merchant, the item, the date, and the price." | ✓ | exact confirm-form fields (platform/product/date/price) |
| 14 | "Then it watches the claim window in the background." | ✓ | monitor-agent + refund-eligibility-card "N days remaining" |
| 15 | "When Best Buy drops the price, ClaimIt catches it." | ✓ | `best_buy.py` adapter is real; proactive-card + price-history-chart |
| 16 | "It checks the policy, so you do not have to." | ✓ | eligibility from `policies` + evidence-pane policy card (highlighted clause) |
| 17 | "Then Gemini drafts the email with the right context." | ❌ | Best Buy draft = **chat script**, not email. → drop "email": "Gemini drafts the **claim** with the right context." (or switch hero, G1) |
| 18 | "Ask for a warmer tone, and it rewrites it." | ✓ | assistant-pane **"Make it friendlier"** → `request_redraft` → regenerating overlay → new version (real!) |
| 19 | "Or make a quick edit yourself." | ✓ | draft-pane Edit tab (mono textarea, "Save changes" → v+1) |
| 20 | "Review it once, then approve." | ✓ | claim detail + Approve button + ApproveConfirmDialog |
| 21 | "ClaimIt sends the claim. You stay focused." | ❌ | Best Buy = paste-into-chat, **not** auto-sent. Auto-send via Gmail only for `email` types. → reword to script-hand-off, or switch hero (G1) |

---

## 9. Open questions for the user

1. **G1 hero decision** — keep Best Buy and reword to chat-script reality (a-2), switch the hero refund to an `email`-type retailer so the auto-send story is literally true (a-1), or edit Best Buy's policy to email (c)?
2. **G2 price protection** — create an Apple-Watch card-issuer mockup (and label as concept), or reframe price-protection as a second *merchant* example (real engine), or cut?
3. **G3 points/rebates** — keep as an explicitly-conceptual "extends to…" mockup, or cut?
4. **Filming** — rebuild demo UI as Remotion shims from `packages/shared/fixtures/*` (recommended), or stand up + seed the live stack for screen capture?
5. **Beat 30/33 wording** — OK to adopt the reworded, MCP-accurate lines (G4) and the "live monitoring vs claim channel" split (G1)?

---

## Appendix — file map (most-cited)

- Frontend hero: `apps/web/src/components/claims/{claim-detail-shell,draft-pane,evidence-pane,assistant-pane,approve-confirm-dialog,post-approve-banner}.tsx`
- Frontend flows: `components/upload/upload-dialog.tsx`, `components/confirm/{extraction-review-form,confidence-banner,receipt-preview}.tsx`, `components/assistant/proactive-card.tsx`, `components/purchase/{price-history-chart,refund-eligibility-card}.tsx`, `components/dashboard/auto-send-banner.tsx`
- Tokens: `apps/web/src/app/globals.css`; primitives `components/ui/{button,card,badge}.tsx`; fonts `apps/web/src/app/layout.tsx`
- Stores (zustand): `apps/web/src/store/{claim-redraft-progress,claim-assistant-prompt,auto-send-banner,ui,notifications,auth}.ts`
- Backend: `apps/ingest-agent/src/{main,extractor,finalize}.py`, `apps/monitor-agent/src/{cron,eligibility}.py` + `adapters/{best_buy,target,seeded}.py`, `apps/claim-agent/src/{main,plan,submit_claim}.py` + `draft/type_a_email.py`, `apps/api-gateway/src/routes/claims.py`
- MCP/obs: `packages/shared/mcp/claimit_mcp/{mongodb,elastic,phoenix,auth}.py`, `packages/shared/observability/`, `infra/terraform/{pubsub,scheduler,mongodb_mcp,phoenix_mcp}.tf`
- Data: `seed/policies/*.json` (26 retailers), `packages/shared/fixtures/{purchase,claim,price_history}.sample.json`, `apps/ingest-agent/tests/fixtures/extraction_cases.json`

---

## 10. Decisions applied (2026-06-03)

The five open questions in §9 were resolved by Will on 2026-06-03 and folded into
**BEAT_SHEET v3.1**. This section is appended (the audit body above is unchanged) so a
future reader can see how each gap was closed.

| # | Open question (§9) | Decision | Resulting beats |
|---|---|---|---|
| G1 | Hero claim-channel mismatch (Best Buy = `chat_script`) | **Hero switched Best Buy → Costco** (email-type; auto-send via Gmail is literally true). Credibility made dual-channel honest. | Beat 17 "When **Costco** drops the price…"; beat 19 (drafts email) & 25 (sends claim) now accurate; beat 29 "Costco, Macy's, Dell… auto-send; Best Buy and Target… chat script today." |
| G2 | Apple Watch / price protection (no fixture, no mechanism) | **Cut** — would be vapor for judges. | Old beats 22–25 deleted. |
| G3 | Points / rebates (not implemented) | **Cut.** | Old beats 26–28 deleted. |
| G4 | MCP wording ("stores every claim state through MCP") | **Reworded** — writes are direct Motor; only reads go through the read-only MCP. | Beat 32 (was 33): "MongoDB Atlas **holds** every claim state, **queried** through MCP." |
| G5 | Visual source (live capture vs shims) | **Remotion shims locked** — reuse `apps/web/` surfaces via a shim layer extending `src/_archive/erdun_shots_v1/shims/`. No live-stack screen capture. | All demo UI beats. |

**Knock-on changes**: the 30s freed by G2+G3 was redistributed into **REFUND DEMO
(60s/12 beats → 90s/18 beats, 0:50–2:20)**. Six beats added — OCR field reveal (14),
price-watch/time-passes (16), rewrite result (21), edit result (23), sent-confirmation
banner (26), draft→outcome bridge (27) — all grounded in real surfaces from §5. The
**Architecture VO (beats 5–9, §7) was locked verbatim**. CREDIBILITY → 2:20–2:32,
IMPLEMENTATION PROOF → 2:32–2:52, PAYOFF → 2:52–3:00. **Total beats 36 → 35.**

**Still-open follow-ups** (not blocking): the §4 "minor wording nit" on beat 11
("email receipt" arrives via Gmail ingestion, not the uploader) was **not** changed —
flag retained for the user. Tier-2 GCP product icons (Cloud Run / Pub/Sub / Cloud
Scheduler) and the Phoenix logo asset are tracked in
`demo-video/remotion/public/brandlogos/MANIFEST.md`.
