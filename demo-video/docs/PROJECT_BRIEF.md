# ClaimIt Demo Video — Project Brief v0.2

> **状态**：进入 Batch 1 执行
> **关系**：本文档是项目专项决策。通用制作纪律以 `VIDEO_PRODUCTION_BIBLE.md` 为准；当本文档与 Bible 冲突时，**Bible 胜出**（除非本文档明确标记 "override"）。
> **配套**：`CLAIMIT_BEAT_SHEET_v02.md`（36 beat 执行表）

## v0.1 → v0.2 改动

- §3.2 价保 demo 数据：AirPods $199→$149 改为 **Apple Watch Series 9 $399→$329**
- §9 Open Items 多项 resolved（VO 语言、Erdun shots 处理、批次策略）
- §10 Decision Log 新增 6 条 2026-06-03 决策
- §11 新增"配套文档"小节

---

## 0. 一页摘要

| 项 | 值 |
|---|---|
| 项目 | ClaimIt 3 分钟 demo 视频 |
| 用途 | Google + MongoDB hackathon 提交 |
| 时长 | 3:00（10800 帧 @ 60fps） |
| 主旨 (THESIS) | AI 帮你完成每一步退款，把该拿回的钱拿回来 |
| 结构 | Hook (0:00–0:20) – Promise (0:20–2:50) – Payoff (2:50–3:00) |
| 节奏 | ≥ 5 秒/beat，共 36 个 visual beat |
| 评委 | Google 团队 + MongoDB 团队 |
| 制作纪律 | `VIDEO_PRODUCTION_BIBLE.md` v1.0 |
| 执行 spec | `CLAIMIT_BEAT_SHEET_v02.md` |
| 配套审查 | `docs/REVIEW_CHECKLIST.md` + `scripts/auto_review.mjs`（待建立） |
| **当前阶段** | **Batch 1: HOOK (beats 1-4)** |

---

## 1. 项目背景

这是 ClaimIt 团队为 **Google + MongoDB hackathon** 提交的 3 分钟 demo 视频。评审是 **Google 团队 + MongoDB 团队的工程师 / 产品 leader**，不是终端消费者。

这一定位带来**双重叙事约束**：

1. **产品向**：观众要能复述 thesis 并理解 ClaimIt 做什么。
2. **评委向**：评委以"技术人"身份观看时，要看到我们的 Google / MongoDB / AI 栈不是"贴 logo"，而是**功能性深度集成**。

这两条**贯穿整片穿插**，不分两段。

**时间线**：从 2026-06-03 开始制作；3 天出可看版本；5 天团队优化完成；8-9 天总周期前提交 Devpost。

---

## 2. THESIS（产品主旨）

```
AI 帮你完成每一步退款，把该拿回的钱拿回来。
```

存放：`demo-video/docs/THESIS.md` 第一行。

**强制规则**：

- 这一句必须在视频里出现 **至少两次**：Hook 段末尾（beat #4）+ Payoff 段（beat #36）。
- 任何 shot / beat 拍板前必须回答："这个 beat 让 thesis 更清楚了吗？" 答 "否" 则删。
- 修改这一句需要 PR 标签 `[thesis-change]` + 全员 review。

---

## 3. EVIDENCE PILLARS（评委向技术叙事）

```
Built on Google Gemini ADK · MongoDB Atlas + MCP · Arize Phoenix observability
```

### 3.1 Google 评委关心的

| 技术 | 我们怎么用 | 在片中位置 |
|---|---|---|
| **Google Gemini** | 主 LLM，agent reasoning + draft generation | beat #12, #30 |
| **Google ADK** | agent 编排框架 | beat #30, #34, #35 |
| **Google Pub/Sub** | 实时邮件事件触发 | beat #29, #30 |
| **Google Cloud Run** | agent 部署 runtime | beat #29, #30, #34 |
| **Google Cloud Scheduler** | 定时巡检 | beat #34 |

**生产环境全栈用 Google。** Claude 只用在开发期（Claude Code 写代码），不出现在视频里。

### 3.2 MongoDB 评委关心的

| 技术 | 我们怎么用 | 在片中位置 |
|---|---|---|
| **MongoDB Atlas** | claim 文档存储、user state、claim 演化时间线 | beat #29, #31, #34 |
| **MongoDB MCP** | agent 直接通过 MCP 读写 Mongo（不经过手写 ORM）—— **核心评委加分点** | **beat #31（highlight）** |

### 3.3 ES + Phoenix

| 技术 | 我们怎么用 | 在片中位置 |
|---|---|---|
| **Elasticsearch + ES MCP** | 快速查询（Mongo 慢的时候 agent 用 ES 查），用于 sub-50ms lookup | beat #32 |
| **Arize Phoenix + Phoenix MCP** | agent trace 可观测，agent 自己能 query trace | beat #33 |

---

## 4. 节奏规范（项目专项 override Bible）

- **总时长**：3:00（10800 frames @ 60fps）
- **Beat 密度**：每 5 秒**必须**有一次 visual 切换或新元素入场。**比 Bible 默认严格**。
- **VO 节奏**：VO 可跨 visual 切换持续讲，单一主题最长 8 秒。
- **总 beat 数**：36
- **唯一例外**：Payoff beat #36 hold 7 秒（收尾呼吸，Bible §X 允许）

---

## 5. 结构骨架

**Hook–Promise–Payoff**，分配：

```
HOOK     0:00 – 0:20   (4 beats, 1200 帧)
PROMISE  0:20 – 2:50   (30 beats, 9000 帧)
PAYOFF   2:50 – 3:00   (2 beats, 600 帧)
```

详细见 `CLAIMIT_BEAT_SHEET_v02.md`。

---

## 6. 视觉品味基准

按 `VIDEO_PRODUCTION_BIBLE.md` 全部规则。**项目专项补充**：

- **审美档位**：Linear / Stripe / Vercel 发布片密度 + Apple 的克制
- **核心 demo claim**：Sony Best Buy 退款 $50（refund flow）+ Apple Watch Series 9 价保 $70（价保 flow）
- **品牌色系**：复用 `apps/web/src/app/globals.css` 的 token，禁止硬编码颜色

---

## 7. 评委加分项（按价值降序）

| # | 加分项 | beat |
|---|---|---|
| 1 | **MongoDB MCP 显式 demo**：可视化 agent 实时通过 MCP 写入 Mongo | **#31** |
| 2 | **Arize Phoenix trace 一闪**：评委看到 agent 决策可观测 | #33 |
| 3 | **Gemini ADK 编排图**：极简流程图 + "Powered by Gemini ADK" | #29-30 |
| 4 | **end-to-end 流畅性**：邮件到账户钱回流的完整链路无跳步 | #8-19 |
| 5 | **真实数据**：所有显示的 claim 状态、金额、时间戳都来自真实 fixture | 整片 |

---

## 8. 自动化 Review

每次 per-beat 或 batch render 完成后自动跑 4 阶段 review（详见 Bible §X / `REVIEW_CHECKLIST.md`）。

**通过标准**：4 阶段 violations.json 全为空数组 → 进入用户 review。

**诚实声明**：Auto-review 干 70% 机械问题，**不替代人工审美判断**。

---

## 9. Open Items（按优先级）

- [x] ~~完整 beat sheet~~ → ✅ `CLAIMIT_BEAT_SHEET_v02.md` 已完成
- [x] ~~价保 demo 商品~~ → ✅ Apple Watch Series 9 $399→$329
- [x] ~~Erdun shots 处理~~ → ✅ 移至 `src/_archive/erdun_shots_v1/` 保留
- [x] ~~Anthropic Claude 是否在视频中出现~~ → ✅ 不出现，全栈 Google
- [x] ~~VO 语言~~ → ✅ 英文 master，中文是 reference 不渲染
- [x] ~~批次策略~~ → ✅ 5 批次，先做 Batch 1 HOOK
- [x] ~~VO 生成策略~~ → ✅ 全部 36 条 ElevenLabs 一次性批量生成
- [ ] Elasticsearch 在产品里的具体技术细节，agent 选择 ES vs Mongo 的策略文档（影响 beat #32 视觉）
- [ ] 评委 Devpost 提交格式（YouTube 链接 / mp4 上传 / 限制）
- [ ] 是否要 9:16 social cut（TikTok / Reels）—— 当前判断**不做**，时间不够
- [ ] 团队成员 4 张头像是否要重拍 / 重裁
- [ ] Beat #29 架构图视觉风格 —— "白板手绘" vs "工程仪表板"
- [ ] Beat #33 Phoenix dashboard —— 真实截图 vs 重绘 mockup

---

## 10. Decision Log

| 日期 | 决策 | 决策人 |
|---|---|---|
| 2026-06-02 | 制作纪律采用 `VIDEO_PRODUCTION_BIBLE.md` v1.0 | Will |
| 2026-06-02 | THESIS 锁定为「AI 帮你完成每一步退款，把该拿回的钱拿回来」 | Will |
| 2026-06-02 | 结构采用 Hook–Promise–Payoff，时长 3:00 | Will |
| 2026-06-02 | Beat 密度 ≥ 5s/beat，总 36 beat | Will |
| 2026-06-02 | Tech stack pillar：Gemini / ADK / MongoDB Atlas + MCP / Arize Phoenix + MCP / ES + MCP | Will |
| 2026-06-02 | 核心 demo claim 沿用 Sony Best Buy 退款 $50 | Will |
| 2026-06-02 | Auto-review 四阶段流程纳入工作流 | Will |
| **2026-06-03** | **生产栈全 Google（不含 Anthropic Claude），Claude 仅开发期用** | **Will** |
| **2026-06-03** | **痛点统计：Only 2 out of 100 (National Consumers League) —— 用于 beat #3** | **Will** |
| **2026-06-03** | **VO 语言：英文 master + 中文 reference**（不渲染中文） | **Will** |
| **2026-06-03** | **价保 demo：Apple Watch Series 9 $399→$329（$70 差额）** | **Will** |
| **2026-06-03** | **Erdun 现有 `src/shots/` 移到 `src/_archive/erdun_shots_v1/` 保留备用** | **Will** |
| **2026-06-03** | **执行采用 5 批次：Batch 1 HOOK / Batch 2 Intro / Batch 3 Refund / Batch 4 价保+积分+credibility / Batch 5 Tech+Payoff** | **Will** |
| **2026-06-03** | **VO 一次性批量生成全部 36 条**（成本可忽略，避免 draft/final 二次工作） | **Will** |

---

## 11. 配套文档

| 文档 | 路径（仓库内） | 角色 |
|---|---|---|
| Production Bible | `demo-video/docs/VIDEO_PRODUCTION_BIBLE.md` | 通用规则 |
| Project Brief | `demo-video/docs/PROJECT_BRIEF.md` | 本文档 |
| Beat Sheet | `demo-video/docs/BEAT_SHEET.md` | 36 beat 执行表 |
| Thesis | `demo-video/docs/THESIS.md` | 单行主旨 |
| Review Checklist | `demo-video/docs/REVIEW_CHECKLIST.md` | （待建） auto-review checklist |
| 历史归档 | `demo-video/docs/archive/` | Erdun v1 的旧 SHOT_SPEC / SCRIPT / STORYBOARD 等 |

---

## 12. 修改本文档的规则

- 任何决策（§2 / §3 / §4 / §5 / §6 / §7 / §8）变更：PR + Decision Log 加一行
- §9 Open Items 解决：直接 `[x]` 划掉 + Decision Log 加一行
- §10 Decision Log：**只追加，不删除**（反悔了就加新决策覆盖，原决策保留）

把本文档当**合同**，不当 wiki。
