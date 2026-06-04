# ClaimIt Demo Video — Beat Sheet v3.1

> **Status**: 结构锁，VO 文案锁（Architecture 段已锁），等视觉构想完整后批量生成 VO
> **VO 生成**: **暂停** —— 等所有 35 beat 视觉构想都确认后再批量生成（省 credits + 避免反复 retake）
> **Voice**: Leo v2 "Technical and Precise" (ELEVENLABS voice library), native speed (1.0)
> **总长**: 3:00 / 10800 frames @ 60fps
> **总 beats**: 35
> **依据**: 前端/后端审计见 `FRONTEND_AUDIT_v1.md`（v3.1 的所有改动来自该审计的 G1–G5 决策）

## v0.2 → v3 关键改动

1. **Architecture 段提前** —— 从片尾 Tech Wall 拆出来移到 0:20–0:50，紧接 Hook
2. **Refund Demo 拉长** —— 真实流程完整展开
3. **Implementation Proof 替代原 Tech Wall** —— 不重复 Architecture，转为"证明系统真实"
4. **VO 文案大改** —— 更 native、更 honest
5. **字幕 universal**：所有 VO 全部加字幕，纯橙 #FFA500
6. **VO 批量生成暂停**

## v3 → v3.1 关键改动（基于 FRONTEND_AUDIT_v1.md）

1. **Hero 换成 Costco**（G1）—— Best Buy/Target 真实 claim_type 是 `chat_script`，不是 email。Costco 是 `email` 类型，auto-send 走 Gmail 是真的。Beat 17 "When Costco drops…"；Beat 19 起草 email、Beat 25 自动发送 现在都属实。
2. **删除 Price Protection（旧 22–25）+ Points/Rebates（旧 26–28）**（G2/G3）—— 无真实代码支撑（无 Apple Watch fixture、Apple 不在 26 家零售商内、无 card-issuer 机制、无积分/返利功能）。对评委是 vapor。
3. **Refund Demo 60s/12 beats → 90s/18 beats（0:50–2:20）** —— 腾出的 30s 全部并入退款主流程；新增 6 个 beat（OCR 逐字段揭示、价格巡检/时间流逝、改写结果、手动编辑结果、发送确认 banner、draft→outcome 收束）。
4. **Credibility Beat 29 双通道诚实**（G1）—— 同时讲 auto-send（email）和 chat-script 两条真实通道，不假装全是 email。
5. **MCP 文案修正 Beat 32（旧 33）**（G4）—— "MongoDB Atlas holds every claim state, queried through MCP"（写入走直连 Motor，只有读经过 MCP）。
6. **Architecture VO（Beat 5–9）锁定** —— 采用 `FRONTEND_AUDIT_v1.md` §7 草稿，逐字 lock。
7. **重新编号** —— 总 beats 36 → 35。
8. **视觉来源锁定 Remotion shims**（G5）—— 复用 `apps/web/` 组件，扩展 `src/_archive/erdun_shots_v1/shims/`；不做 live stack 录屏。

## 整体结构

| Time | Section | Duration | Beats | Status |
|---|---|---|---|---|
| 0:00–0:20 | HOOK | 20s | 1–4 | VO 锁 |
| 0:20–0:50 | ARCHITECTURE | 30s | 5–9 | **VO 锁 (v3.1 locked)** |
| 0:50–2:20 | REFUND DEMO | 90s | 10–27 | VO 锁（Costco hero）|
| 2:20–2:32 | CREDIBILITY | 12s | 28–29 | VO 锁 |
| 2:32–2:52 | IMPLEMENTATION PROOF | 20s | 30–34 | VO 锁 |
| 2:52–3:00 | PAYOFF | 8s | 35 | VO 锁 |

## 字幕规范 (universal)

所有 VO 加字幕，无例外。

| 项 | 值 |
|---|---|
| 字体 | Inter weight 500, 32px |
| 字色 | `#FFA500` (CSS 标准 "orange") |
| 背景 pill | `rgba(8, 12, 20, 0.72)` |
| Pill padding | 横 20px / 纵 10px |
| Pill border-radius | 6px |
| 位置 | 屏幕底部 100px |
| 入场 | 6 帧 fade-in + 微 slide-up 8px |
| 出场 | 6 帧 fade-out |
| 同步 | 字幕入场 ≤ VO 开始 + 4 帧 |
| 文字 | 逐字对 VO，不简写 |

## HOOK (0:00–0:20)

Goal: Create the feeling that money is being lost quietly, then reposition 
ClaimIt as the workflow that captures it.

| Beat | Time | VO (EN) | VO (中) |
|---|---|---|---|
| 1 | 0:00–0:05 | Every year, money slips through the cracks. | 每一年，都有钱从缝隙里流走。 |
| 2 | 0:05–0:10 | Refunds. Price protection. Rewards. Rebates. | 退款、价保、积分、返利。 |
| 3 | 0:10–0:15 | Only two out of a hundred ever get it back. | 每 100 个符合条件的人，只有 2 个真正拿回来。 |
| 4 | 0:15–0:20 | ClaimIt turns that paperwork into an AI workflow. | ClaimIt 把这些繁琐流程变成 AI workflow。 |

## ARCHITECTURE / HOW CLAIMIT WORKS (0:20–0:50)

Status: **VO LOCKED (v3.1)** — grounded in `FRONTEND_AUDIT_v1.md` §2 / §7.

Real high-level flow (per audit):
1. Receipts/emails enter via Gmail push or manual upload
2. Gemini (multimodal) extracts merchant, item, date, price → MongoDB
3. monitor-agent (Cloud Scheduler, every 15 min) watches price + claim window; eligibility is data-driven from the `policies` collection
4. claim-agent (Gemini ADK) drafts the claim
5. Frontend 3-pane (Draft / Evidence / Assistant) shows the draft; user edits, rewrites, or approves
6. Approved email claims are sent via the Gmail Send API (from the user's own Gmail)
7. Arize Phoenix traces every decision, tool call, and draft

| Beat | Time | VO (EN) | VO (中) |
|---|---|---|---|
| 5 | 0:20–0:26 | A receipt reaches ClaimIt — forwarded from your inbox, or uploaded by hand. | 一张收据进入 ClaimIt —— 从你的收件箱转发，或手动上传。 |
| 6 | 0:26–0:32 | Gemini reads it and pulls out the merchant, item, date, and price. | Gemini 读取它，提取商家、商品、日期和价格。 |
| 7 | 0:32–0:38 | It's stored in MongoDB, and an agent watches the price and the claim window. | 它被存进 MongoDB，一个 agent 盯着价格和申请窗口。 |
| 8 | 0:38–0:44 | When a drop clears the policy, the agent drafts the claim for you. | 当降价符合政策时，agent 替你起草这份 claim。 |
| 9 | 0:44–0:50 | You approve it — and every decision, tool call, and draft is traced. | 你批准它 —— 每一次决策、工具调用和草稿都被追踪。 |

## REFUND DEMO (0:50–2:20)

Goal: Show the main product flow in a friendly, premium, human way. Apple
narration tone. Use "you," not "the user." Don't say ClaimIt guarantees money
back — say ClaimIt prepares, drafts, sends.

> **Hero = Costco** (email-type policy, `covers_own_drops`, auto-send via Gmail).
> 6 beats are new/expanded vs v3 — marked **[NEW]** below. All other beats are
> the v3 wording verbatim (beat 17 Costco swap; beats 19 & 25 explicitly unchanged).

| Beat | Time | VO (EN) | VO (中) |
|---|---|---|---|
| 10 | 0:50–0:55 | It starts with a receipt. | 它从一张收据开始。 |
| 11 | 0:55–1:00 | Upload a photo or a PDF — or let ClaimIt read it from your inbox. | 上传照片或 PDF —— 或者让 ClaimIt 直接从你的邮箱读取。 |
| 12 | 1:00–1:05 | ClaimIt pulls out the details for you. | ClaimIt 替你提取关键信息。 |
| 13 | 1:05–1:10 | The merchant, the item, the date, and the price. | 商家、商品、日期和价格。 |
| 14 | 1:10–1:15 | **[NEW]** Each value lifted from the receipt — yours to check and correct. | 每一项都来自收据 —— 你可以核对和修改。 |
| 15 | 1:15–1:20 | Then it watches the claim window in the background. | 然后，它在后台盯着申请窗口。 |
| 16 | 1:20–1:25 | **[NEW]** Days pass, and it keeps checking the price for you. | 时间一天天过去，它一直替你盯着价格。 |
| 17 | 1:25–1:30 | When Costco drops the price, ClaimIt catches it. | 当 Costco 降价时，ClaimIt 会发现。 |
| 18 | 1:30–1:35 | It checks the policy, so you do not have to. | 它替你检查政策，所以你不用自己查。 |
| 19 | 1:35–1:40 | Then Gemini drafts the email with the right context. | 然后 Gemini 根据上下文写好邮件。 |
| 20 | 1:40–1:45 | Ask for a warmer tone, and it rewrites it. | 你想要更友好的语气，它就帮你改写。 |
| 21 | 1:45–1:50 | **[NEW]** Seconds later, the new version is ready to review. | 几秒钟后，新版本就可以查看了。 |
| 22 | 1:50–1:55 | Or make a quick edit yourself. | 或者你自己快速改一句。 |
| 23 | 1:55–2:00 | **[NEW]** Your wording, saved as a fresh draft. | 你改的内容，会存成一份新草稿。 |
| 24 | 2:00–2:05 | Review it once, then approve. | 看一眼，然后批准。 |
| 25 | 2:05–2:10 | ClaimIt sends the claim. You stay focused. | ClaimIt 发出申请。你继续专注自己的事。 |
| 26 | 2:10–2:15 | **[NEW]** A banner confirms it — sent from your own Gmail. | 一条提示确认 —— 已从你自己的 Gmail 发出。 |
| 27 | 2:15–2:20 | **[NEW]** Every claim, tracked from draft to outcome. | 每一个 claim，从草稿到结果，全程可追踪。 |

## CREDIBILITY (2:20–2:32)

Frame as: 26 policies mapped; **two** claim channels live today (auto-send email
+ chat-script); more mapped for rollout. Honest about both channels — see
`FRONTEND_AUDIT_v1.md` G1. Do NOT frame as "we only support 2 retailers."

| Beat | Time | VO (EN) | VO (中) |
|---|---|---|---|
| 28 | 2:20–2:26 | We mapped refund policies across twenty-six retailers. | 我们梳理了 26 家零售商的退款政策。 |
| 29 | 2:26–2:32 | Some run on auto-send. Best Buy and Target use a chat script today. | 有些走自动发送。Best Buy 和 Target 目前走 chat script。 |

> ⚠ b29 audio is stale — still has the 8.50s long version from the VO batch.
> Plan: surgical retake when ElevenLabs API key is restored. Subtitle uses
> the trimmed text above; audio plays the longer version. Mismatch is
> temporarily acceptable — HOOK visual build does not touch CREDIBILITY visuals.

On-screen text only (no VO), in orange subtitle pill below team:
- "Twenty-six retailers mapped."
- "Two claim channels live today: auto-send email + chat script."

## IMPLEMENTATION PROOF (2:32–2:52)

> **NOTE (2026-06-03 — DEMO_INTERACTION_SPEC_v1 Phase 1):** Beats **b30–b34 were
> deleted** from the build (beat code under `src/beats/`, their `Root.tsx`
> imports + `<Composition>` entries, and their `out/stills/` + `out/shorts/`
> render artifacts). The VO table below is retained for historical reference
> only. The 2:32–2:52 slot is currently open pending re-plan (e.g. pacing beats
> per spec §4.5, or a timeline adjustment). VO text for b30–b34 remains LOCKED if
> these beats are ever restored.

Don't repeat Architecture content. This is PROOF, not explanation.

| Beat | Time | VO (EN) | VO (中) |
|---|---|---|---|
| 30 | 2:32–2:36 | Under the hood, each claim is an agent workflow. | 在底层，每个 claim 都是一个 agent workflow。 |
| 31 | 2:36–2:40 | Gemini ADK handles reasoning, tools, and draft generation. | Gemini ADK 负责推理、工具调用和草稿生成。 |
| 32 | 2:40–2:44 | MongoDB Atlas holds every claim state, queried through MCP. | MongoDB Atlas 保存每个 claim 状态，通过 MCP 查询。 |
| 33 | 2:44–2:48 | Phoenix traces each decision, tool call, and draft. | Phoenix 追踪每次决策、工具调用和草稿。 |
| 34 | 2:48–2:52 | So the workflow is visible, reviewable, and ready to extend. | 所以这个 workflow 可见、可审查，也可以继续扩展。 |

## PAYOFF (2:52–3:00)

Visual: "Powered by Gemini ADK · MongoDB Atlas · Arize Phoenix" + team names + 
ClaimIt logo.

| Beat | Time | VO (EN) | VO (中) |
|---|---|---|---|
| 35 | 2:52–3:00 | ClaimIt. AI does the paperwork. You approve. | ClaimIt。AI 做 paperwork，你只需要批准。 |

## VO 生成策略 (PAUSED)

No more ElevenLabs API calls until:
- [x] Architecture beats 5-9 VO written (LOCKED in v3.1)
- [ ] All 35 beat visuals planned
- [ ] User confirms final script

## Language Discipline

FORBIDDEN: unlock value, seamless, next generation, powerful platform, 
revolutionize, effortless, guaranteed refund, fully automated for all retailers, 
cutting-edge, state-of-the-art, industry-leading.

PREFERRED: claim, workflow, approval, policy, window, state, trace, tool call, 
email-based claim, reviewable, observable.

## 修订记录

| 版本 | 日期 | 改动 |
|---|---|---|
| v0.1 | 2026-06-02 | 初版 |
| v0.2 | 2026-06-03 | 价保 AirPods → Apple Watch；命名约定；执行批次 |
| v3 | 2026-06-03 | Architecture 提前；VO 大改；字幕 universal；VO 暂停；Leo v2 锁 |
| v3.1 | 2026-06-03 | Hero → Costco; cut PP+Points; Refund expanded to 90s/18 beats; Beat 30 dual-channel; Beat 33 MCP wording; ARCH VO locked |
