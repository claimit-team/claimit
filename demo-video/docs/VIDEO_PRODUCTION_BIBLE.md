# ClaimIt 视频制作 Workflow & 质量标准 v1.0

**适用范围**：使用 Remotion 制作 3 分钟左右的产品宣传 / demo 视频。
**质量标杆**：Apple 产品发布视频、Linear / Vercel / Stripe / Raycast 发布片这一档。
**适用对象**：任何参与视频制作的团队成员（设计、动效、配音、剪辑、工程）。
**文档性质**：这是 production bible —— 每一条都不是建议而是默认执行的标准。要偏离必须在 PR 描述里写明理由。

---

## 0. 关于这份文档

视频是观众体验，不是代码工程的副产品。一个 3 分钟的视频里观众会做 ~180 次潜意识判断（每秒一次）—— "这看起来专业吗？"。任何一次失败的判断都会让后续观看体验下降。这份文档存在的目的就是把每一次判断的胜率拉到 95%+。

这份文档不针对当前 repo 的具体实现 —— 它从零开始定义，便于任何新成员、任何新项目复用。当前 `demo-video/` 里已经做的部分可能符合或不符合本文档；不符合的地方要么按本文档改，要么写一份 deviation 说明放在 `docs/deviations/`。

---

## Part I — Pre-production（拍摄/制作开始前）

### 1.1 一句话定位

任何制作工作开始前，团队必须能用**不超过 15 个字**的一句话回答："这个视频要让观众明白什么？"

不合格的例子：

- "展示 ClaimIt 的功能"（太抽象）
- "演示 demo + 介绍团队 + 显示技术栈"（多个目标 = 没目标）

合格的例子：

- "AI 帮你把所有该退的钱拿回来"
- "一个让购物退款自动化的 AI 助手"

这句话写在 `docs/THESIS.md` 第一行。之后每个 shot 决策都要回答："这个 shot 让 thesis 更清楚了吗？" 答案是"没有"就删掉。

### 1.2 结构选型

3 分钟视频可用的结构有限，**选其一并明示**：

| 结构 | 适用场景 | 时长分配 |
| --- | --- | --- |
| **Hook–Promise–Payoff** | 产品 demo / 短广告 | Hook 0:00–0:20，Promise 0:20–2:30，Payoff 2:30–3:00 |
| **Problem–Solution–Proof** | B2B SaaS 介绍 | Problem 0:00–0:40，Solution 0:40–2:20，Proof + CTA 2:20–3:00 |
| **三幕剧**（Setup–Confrontation–Resolution） | 故事化广告（Apple "Misunderstood"那种） | 每幕 1 分钟 |

选型写在 `docs/STRUCTURE.md`。

### 1.3 Beat sheet

每 5–8 秒必须有一个"视觉 / 信息 idea 切换"，否则观众注意力流失。3 分钟视频应该有 **22–36 个 beat**（不是 shot，是信息节点）。

Beat sheet 模板：

```
Beat #  | Time          | Idea / Information                       | Visual hook
01      | 0:00–0:06     | "购物有 4 种容易丢的钱"                    | Money flying out of phone
02      | 0:06–0:12     | "ClaimIt 帮你找回来"                       | Logo arrival, light scene
...
```

Beat sheet 不画完不准开始写 Remotion 代码。这是最常被跳过的步骤，也是最贵的错误来源。

### 1.4 Script lock & Storyboard lock

**两次锁定，单向门**：

1. **Script lock**：VO 文本定稿后不再改字。Script lock 之前可以任意改，之后必须走变更流程（commit 必须带 `[script-change]` tag，需要团队 review）。
2. **Storyboard lock**：每个 shot 的视觉意图（key frames 长什么样）定稿后，进入动画实现阶段不再改构图。

不锁定的代价：动画做了一半改 script → 时长全部要重算 → 音轨重做 → 几小时工作量被废。

### 1.5 Mood board & 参考片

开工前每个人必须看过：

- 3 支同类产品的发布视频
- 1 支被公认精品的动效片（Apple "Behind the Mac"、Stripe Sessions opener、Linear 2023 发布）
- 1 支同时长（2–4 分钟）的真实案例

参考片放在 `docs/REFERENCES.md`，附上"这片子哪些地方我们要学"。

---

## Part II — 技术地基

### 2.1 分辨率 / fps / 长宽比 决策树

| 决策点 | 默认值 | 何时偏离 |
| --- | --- | --- |
| 分辨率 | 1920×1080 | 永不向下；如果交付要求 4K，源工程改 3840×2160 |
| **渲染时 scale** | `--scale=2`（实际渲染 2160p，下采样 1080p） | 当 CPU/内存不够时降到 1，但要在 QA 阶段确认文字可读性 |
| FPS | 60 | 想要电影感（更慢更稳）用 30；想要 TikTok 感（更跳跃）用 30 但加 motion blur；广告类默认 60 |
| 主长宽比 | 16:9 (1920×1080) | 必出；TikTok/Reels 派生 9:16 是单独 composition，不是 master 切版 |
| 颜色空间 | `bt709`（渲染时 `--color-space=bt709`） | 永不偏离 |
| 像素格式 | `yuv420p` | 永不偏离（iOS Safari / QuickTime 必需） |

**为什么 `--scale=2` 是默认**：1080p 视频在 Retina 屏（MacBook、iPhone）会被放大显示，每个 1080p 像素 = 2 个设备像素，文字会糊。源渲染 4K 下采样 1080p 后文字锐度回来了，文件大小可控。代价是渲染时间 ×4，可接受。

### 2.2 项目结构

每个视频项目目录长这样：

```
demo-video/
├── docs/
│   ├── THESIS.md               # 一句话定位
│   ├── STRUCTURE.md            # 结构选型 + beat sheet
│   ├── SHOT_SPEC.md            # 单一权威：每个 shot 的 spec
│   ├── SCRIPT.md               # VO 文本（script-locked 后只能加 [script-change] tag 改）
│   ├── STORYBOARD.md           # 视觉意图（storyboard-locked 后冻结）
│   ├── REFERENCES.md           # mood board / 参考片
│   └── archive/                # 不再适用但有历史价值的文档
├── remotion/
│   ├── src/
│   │   ├── Root.tsx            # 注册所有 composition
│   │   ├── Timeline.tsx        # 主时间线
│   │   ├── shots/              # 每个 shot 一个文件夹
│   │   ├── layers/             # 跨 shot 的视觉层
│   │   ├── audio/              # AudioMix + 字幕
│   │   ├── polish/             # 通用动效原语 (Bloom, Grain, etc)
│   │   ├── data/               # 静态数据 (mock claim 等)
│   │   ├── shims/              # 真实产品组件适配层（如需 reuse）
│   │   ├── globals.css         # 设计 token import
│   │   └── load-fonts.ts       # 字体加载（必须有）
│   ├── public/
│   │   ├── audio/{vo,sfx,music}/
│   │   ├── fonts/              # woff2 文件
│   │   ├── brandlogos/
│   │   └── images/             # 静态图片资源
│   ├── scripts/
│   │   └── gen_*.mjs           # 音频 / 资源生成脚本
│   ├── remotion.config.ts
│   └── package.json
└── README.md                    # 怎么 preview / render / 贡献
```

### 2.3 Composition 架构

**铁律**：必须同时存在两类 composition。

1. **一个 master composition**（如 `ClaimItFilm`）：完整 3 分钟，用于最终渲染。
2. **N 个 per-shot debug composition**（如 `Shot01`, `Shot02`...）：每个 shot 独立可预览，时长 = 那个 shot 的时长。

为什么必须有 per-shot debug：master render 一次 3 分钟，per-shot render 一次 5–10 秒。迭代效率差 30–60 倍。**没有 per-shot debug composition 是不专业的视频项目。**

代码结构：

```tsx
// Root.tsx
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Master */}
      <Composition
        id="MasterFilm"
        component={Timeline}
        durationInFrames={10800}  // 3:00 @ 60fps
        fps={60}
        width={1920}
        height={1080}
      />
      {/* Per-shot debugs */}
      <Composition id="Shot01" component={Shot01} durationInFrames={180} fps={60} width={1920} height={1080} />
      <Composition id="Shot02" component={Shot02} durationInFrames={540} fps={60} width={1920} height={1080} />
      {/* ... 每个 shot 一行 */}
    </>
  );
};
```

### 2.4 Sequence / AbsoluteFill / Series 的使用纪律

- **`<Sequence from={N} durationInFrames={M}>`**：用于在 master timeline 上把某个 shot 放到 frame N 开始，持续 M 帧。注意 `useCurrentFrame()` 在 Sequence 内部是**相对**于 Sequence 起点的，不是全局帧。
- **`<AbsoluteFill>`**：当需要多个元素叠加显示时用。靠后的元素在视觉上**层级更高**（不需要 z-index）。
- **`<Series>` / `<Series.Sequence>`**：当多个 shot 严格按顺序播放、不需要任何重叠时用。比 `<Sequence>` 写起来更短。
- **不要嵌套超过 3 层 Sequence**。超过 3 层后调试时间偏移会非常痛苦。
- **每个 Sequence 加 `name` 属性**：Studio 时间轴上显示 label，找问题快 10 倍。

---

## Part III — 动画工艺

### 3.1 三条铁律

1. **所有动画必须由 `useCurrentFrame()` 驱动**。永不用 CSS transition、CSS @keyframes、setTimeout、setInterval、requestAnimationFrame、Framer Motion 的时间驱动模式。
2. **组件必须是 deterministic**：`Component(frame=N)` 每次调用必须返回完全一样的输出。不允许依赖 `Math.random()`（用 Remotion 的 `random()`）、`Date.now()`、外部 mutable state。
3. **组件不能依赖渲染顺序**。第 100 帧渲染时不能假设第 99 帧已经渲染过。

**为什么这是铁律**：Remotion 并发渲染（默认开多个 Chrome tab），违反这三条会导致**渲染输出闪烁**，不可调试，最后只能 `--concurrency=1` 凑合，渲染时间翻几倍且 Lambda 部署直接废掉。

### 3.2 缓动曲线（最重要的章节）

**Linear 缓动是业余作品的头号 tell**。Apple、Stripe、Linear 的视频里几乎找不到 linear。

### 标准曲线表（这是 default，shot 里不要每次重写）

| 名字 | bezier 值 | 用途 | 视觉效果 |
| --- | --- | --- | --- |
| `easeOut` | `Easing.bezier(0.16, 1, 0.3, 1)` | 元素入场（fade-in、scale-up、slide-in） | Apple-style：快进入后长缓稳定 |
| `easeIn` | `Easing.bezier(0.4, 0, 1, 1)` | 元素出场（fade-out、缩小消失） | 慢启动后加速消失 |
| `easeInOut` | `Easing.bezier(0.4, 0, 0.2, 1)` | 同一元素的状态切换（颜色变化、位置移动） | Material Design 标准 |
| `sharpOut` | `Easing.bezier(0.4, 0, 0.6, 1)` | 紧凑的小动作（按钮按下、icon 微动） | 短促有力 |
| `slowReveal` | `Easing.bezier(0.65, 0, 0.35, 1)` | 大块内容慢慢展开（页面滚动、长文本浮现） | 庄重 |
| `linear` | `Easing.linear` | **只用于**连续循环（spinner、连续滚动 marquee） | 别在 hero motion 用 |

把这些做成一个统一的 `polish/easings.ts` 导出，每个 shot 从这里 import，不要散落定义。

```tsx
// polish/easings.ts
import { Easing } from 'remotion';

export const easings = {
  easeOut: Easing.bezier(0.16, 1, 0.3, 1),
  easeIn: Easing.bezier(0.4, 0, 1, 1),
  easeInOut: Easing.bezier(0.4, 0, 0.2, 1),
  sharpOut: Easing.bezier(0.4, 0, 0.6, 1),
  slowReveal: Easing.bezier(0.65, 0, 0.35, 1),
} as const;
```

### Spring vs interpolate 决策

| 用 `interpolate()` + bezier 当 | 用 `spring()` 当 |
| --- | --- |
| 元素从 A 到 B 精确控制时长 | 想要"物理感"，回弹、震荡 |
| 同步音乐节拍 | 入场需要活泼感（卡通、儿童向） |
| 多个元素需要保持节奏一致 | 单个独立元素 |
| 严肃 / 高端品牌（Apple、企业） | 友好 / 活泼品牌（消费应用） |

**默认偏向 `interpolate`**。Spring 用多了会显得"网页应用感"而非"视频感"。

Spring 配置参考：

```tsx
const value = spring({
  frame,
  fps,
  config: {
    damping: 14,   // 默认 10；越高越稳，越低越弹
    stiffness: 120, // 默认 100；越高越快
    mass: 1,       // 默认 1;越大越"重"
  },
});
```

弹一下就停（推荐默认）：damping 14–18；弹两下：10；持续摇晃：6 以下（很少用）。

### 3.3 Stagger（启动错位）法则

**永不让两个元素同时启动 motion**。两个或更多元素同时入场视觉上会"撞"，看起来业余。

错位时长：

- **基础错位**：3–6 帧（50–100ms @ 60fps），适用于同一组（如 3 个 card 同时入场）
- **节奏错位**：12–18 帧（200–300ms），适用于父子关系（如 title 入场 → 副标题入场）
- **戏剧错位**：30–60 帧（0.5–1s），适用于段落切换（如 hero shot 完成 → CTA 入场）

代码模式：

```tsx
const cards = ['Card A', 'Card B', 'Card C'];

return cards.map((card, i) => {
  const cardOpacity = interpolate(
    frame,
    [0 + i * 6, 30 + i * 6],  // 每张错位 6 帧
    [0, 1],
    { easing: easings.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  return <div key={card} style={{ opacity: cardOpacity }}>{card}</div>;
});
```

### 3.4 Motion 预算

在任意一帧上，**最多 2 个元素正在动**。3 个以上同时动 = 观众注意力被分散 = 业余。

如何检查：scrub 时间轴，每隔 5 帧暂停一次，数"正在变化的视觉元素"。≥3 就要重新设计这段。

例外：粒子效果、grain texture 这种"装饰性持续动效"不计入。

---

## Part IV — 排版规范

### 4.1 字体加载（不可妥协）

**头号渲染失败原因：字体没加载完成**。后果：渲染出来的 mp4 文字变成系统默认 serif（Times），整片报废。

唯一可接受的字体加载方式：

```tsx
// load-fonts.ts
import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

loadFont({
  family: 'Inter',
  url: staticFile('fonts/inter-400.woff2'),
  weight: '400',
  format: 'woff2',
});

loadFont({
  family: 'Inter',
  url: staticFile('fonts/inter-600.woff2'),
  weight: '600',
  format: 'woff2',
});

loadFont({
  family: 'Inter',
  url: staticFile('fonts/inter-700.woff2'),
  weight: '700',
  format: 'woff2',
});
```

然后在 `Root.tsx` 顶部 `import './load-fonts';`（顺序很重要，要在任何 Composition 之前）。

**禁止的字体加载方式**：

- 用 `next/font/google`（这是 Next.js 专属）
- 用 `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`（headless Chrome 可能在字体到位前就截图）
- 在组件 useEffect 里加载（已经迟了）

**只 import 你真用的 weight**。Inter 有 9 个 weight，全部 import 每个文件 ~50KB → 总 450KB → 第一帧延迟。3–4 个 weight 够用。

### 4.2 字号 / 字重 / 字距表（1080p 基准）

| 用途 | 字号 | 字重 | letter-spacing | 行高 |
| --- | --- | --- | --- | --- |
| 巨幅 hero / closing | 120–160px | 700 | -0.04em | 1.0 |
| 标题 | 72–96px | 600–700 | -0.03em | 1.05 |
| 副标题 / H2 | 40–56px | 600 | -0.02em | 1.1 |
| 强调正文 | 28–36px | 500 | -0.01em | 1.3 |
| 普通正文 | 22–28px | 400 | 0 | 1.4 |
| 字幕 | 30–36px | 500 | 0 | 1.3 |
| 小字 / caption | 16–20px | 500 | +0.02em | 1.4 |

**为什么大字要负 letter-spacing**：Inter 在大号下默认间距偏松，看起来"散"。负 letter-spacing 让大字感觉"凝聚"，是 Apple、Linear、Stripe 的统一做法。

### 4.3 字幕规范

字幕**不是给所有 VO 加**。只给重点信息加字幕：

- 一句话 thesis
- 关键产品名 / 价格 / 数字
- 难听清的术语

字幕样式：

| 项 | 值 |
| --- | --- |
| 字体 | Inter 500，30–34px |
| 字色 | 纯白 `#FFFFFF` |
| 背景 pill | `rgba(8, 12, 20, 0.62)` |
| Pill padding | 横 18px / 纵 8px |
| Pill border-radius | 6px |
| 位置 | 底部 80px（不是 24/40px，避免 YouTube/TikTok 的 UI 遮挡） |
| 入场 | 6 帧 fade-in @ easeOut |
| 出场 | 6 帧 fade-out @ easeIn |
| 最短停留 | VO 时长 + 4 帧前导 + 4 帧后置 |

### 4.4 永不动 font-weight

`font-weight: 400 → 700` 的动画看起来像加载 bug，因为浏览器在中间帧会做奇怪的 fallback。需要"加粗强调"的视觉效果，用其他手段：

- 透明度（次要文字 0.6 → 主要文字 1.0）
- 颜色（灰 → 品牌色）
- 字号微缩（× 1.0 → × 1.05）
- 增加描边或下划线

---

## Part V — 色彩与光

### 5.1 单一 token 源

`polish/tokens.ts` 是**唯一**的颜色定义源。任何 shot 文件里出现 `#` 开头的硬编码颜色 = 代码 review 必驳回。

```tsx
// polish/tokens.ts
export const colors = {
  brand: {
    primary: '#0A2540',     // 品牌深色
    accent:  '#635BFF',     // 品牌强调
  },
  semantic: {
    success: '#00C48C',
    warning: '#FFB020',
    danger:  '#FF5C5C',
  },
  neutral: {
    900: '#0E1116',
    700: '#3A4151',
    500: '#7A8194',
    300: '#C5CAD3',
    100: '#F2F4F8',
    0:   '#FFFFFF',
  },
  bg: {
    dark:  '#080C14',
    light: '#FFFFFF',
  },
} as const;
```

### 5.2 对比度最低线

| 场景 | 对比度要求 |
| --- | --- |
| 大标题（48px+） | ≥ 4.5:1 |
| 普通正文（< 48px） | ≥ 7:1 |
| 字幕 | ≥ 7:1（pill 背景已经保证） |

工具：https://webaim.org/resources/contrastchecker/

### 5.3 渲染时的色彩空间

```bash
npx remotion render ... \
  --color-space=bt709 \
  --image-format=png
```

`bt709` 是当代视频标准（HDTV、YouTube、Vimeo 都用它）。Remotion 5.0 之前默认 `bt601`（CRT 时代标准），不改会有微妙偏色。`--image-format=png` 让中间帧 PNG 而非 JPEG，颜色更准、抗锯齿更好（代价：渲染慢 ~30%）。

---

## Part VI — 声音架构

### 6.1 三层音轨

| 层 | 内容 | 数量 |
| --- | --- | --- |
| Music bed | 整片背景音乐 | 1 条，整片贯穿 |
| Voiceover (VO) | 旁白 | 每个 VO beat 1 条 mp3 |
| SFX | 音效（打字、点击、转场 woosh、coin 等） | 按需 |

### 6.2 响度规范（peak dB）

| 层 | 平常 | VO 期间 ducking 后 |
| --- | --- | --- |
| VO | -3 dB | n/a |
| Music bed | -12 dB | -20 dB |
| SFX | -9 ~ -15 dB（永远低于 VO） | 不变 |

总片最终 LUFS：YouTube 标准 -14 LUFS，TikTok -10 LUFS。这一步可以渲染完后用 ffmpeg loudnorm 后处理，不必在 Remotion 里达成。

### 6.3 Ducking 实现

正确写法（使用 volume callback）：

```tsx
<Audio
  src={staticFile('audio/music/bed.mp3')}
  volume={(f) => {
    // 在 VO 时间窗内 ducking
    const inVO = f >= voStart && f <= voEnd;
    return inVO ? 0.15 : 0.40;  // ~-16dB vs ~-8dB
  }}
/>
```

为什么用 callback 而非每帧 interpolate：Remotion 用 callback 时会在 Studio 画 volume curve，而且渲染更高效。

进 ducking 和退 ducking 都用 8–12 帧（130–200ms）的 fade，**不要瞬切**，否则听感像"咔"一下。

### 6.4 音画同步

**SFX 必须卡到帧**，VO 入场可以容忍 ±2 帧偏差。

帧对帧同步技巧：

1. 用 Audacity 打开 SFX，找到 attack（波形第一个 spike）的精确毫秒数。
2. 换算成帧：`frame = ms × fps / 1000`。
3. 在 Remotion 里用 `<Audio startFrom>` 偏移到那个帧。

**VO 前留 80–150ms 静默 buffer**。直接踩着 music 节拍硬切 VO 会让观众"猛地一惊"。

### 6.5 VO 录制 / 生成标准

如用 AI 生成 VO（ElevenLabs 等）：

| 参数 | 推荐值 |
| --- | --- |
| Stability | 0.55–0.70（再低声音抖，再高声音木） |
| Style | 0.20–0.40 |
| Sample rate | 48 kHz |
| Format | mp3 192 kbps 起步 |
| Trim | 头尾留 ≤ 100ms 静默，多了在 Remotion 里 trim |

如用真人录制：

- 麦距嘴 15–25 cm，正对偏 15° 避喷麦
- 房间要 acoustic treatment（不能在浴室、空房间录）
- 每句录 3 个 take，剪辑时挑最好的
- 录制环境噪音 floor < -50 dB

---

## Part VII — 迭代纪律

### 7.1 Per-shot 调试

**绝大部分迭代在 per-shot composition 上做**。Studio 选中那个 shot 的 debug composition，scrub 时间轴看效果。改一行代码 200ms 浏览器自动刷新。

只有在以下时机切回 master composition：

1. 验证 shot 之间的衔接（出场和入场的时间是否重叠合理）
2. 跨多个 shot 的元素（如整片背景音乐）的连续性
3. 最终 QA

### 7.2 单帧验证（remotion still）

某个 hero 帧的构图、字距、对齐是否对？不要跑视频，跑单帧：

```bash
npx remotion still src/index.ts MasterFilm out/still_3420.png --frame=3420
```

3 秒出图，比视频快得多。重大 hero 帧每个都该有一张"金标准" still 存档在 `out/golden/`，每次 render 后对比有无 regression。

### 7.3 Render 频率

- **每次 commit**：不渲染
- **每个 shot 改完**：渲染那个 per-shot composition 出 mp4，存 `out/shots/shotXX_HHMM.mp4`
- **每天结束**：渲染一次 master，存 `out/master_YYYYMMDD_HHMM.mp4`
- **demo 截止前最后 12 小时**：每 2 小时一次 master + 全员看片

### 7.4 版本归档

`out/` 加入 `.gitignore`（mp4 太大不进 git）。但每次 master render 必须：

1. 命名规范：`master_YYYYMMDD_HHMM_vNN.mp4`
2. 上传到团队云盘（Google Drive / S3 / Notion 附件）
3. 在团队频道发一条带链接的更新

不归档的代价：渲染完 5 小时发现回退某一版反而更好 → 找不到 → 全部重做。

---

## Part VIII — 渲染规范

### 8.1 Master render command（拷贝即用）

```bash
npx remotion render src/index.ts MasterFilm out/master.mp4 \
  --codec=h264 \
  --crf=16 \
  --x264-preset=slow \
  --pixel-format=yuv420p \
  --color-space=bt709 \
  --image-format=png \
  --jpeg-quality=100 \
  --scale=2 \
  --concurrency=$(nproc 2>/dev/null || echo 4) \
  --audio-bitrate=320k \
  --audio-codec=aac
```

参数解释：

| 参数 | 值 | 为什么 |
| --- | --- | --- |
| `--codec` | `h264` | 通用兼容，Lambda 默认 |
| `--crf` | `16` | "视觉无损"档（h264 范围 1–51，默认 18，16 比 18 略好但文件没大多少） |
| `--x264-preset` | `slow` | 文件小、质量高，offline 渲染时间无所谓 |
| `--pixel-format` | `yuv420p` | iOS Safari / QuickTime / 微信 都能播 |
| `--color-space` | `bt709` | 现代视频标准颜色 |
| `--image-format` | `png` | 中间帧无损，颜色和文字最准 |
| `--scale` | `2` | 渲染 4K 下采样 1080p 出文字超锐 |
| `--concurrency` | CPU 核心数 | 充分利用 |
| `--audio-bitrate` | `320k` | 专业级音频 |
| `--audio-codec` | `aac` | mp4 标准音频编码 |

文件大小预期：3 分钟 1080p 60fps 上面参数下大概 60–120 MB。

### 8.2 Studio Render Dialog

如果用 Studio 点 Render 按钮（不推荐用于 final，但适合快速预览）：

1. Codec: H.264
2. CRF: 16
3. Color space: bt709
4. Pixel format: yuv420p
5. JPEG Quality: 80（仅作预览，不要在此用 PNG，速度太慢）
6. Concurrency: half of cores

### 8.3 单 shot quick preview

```bash
npx remotion render src/index.ts Shot05 out/preview/shot05.mp4 \
  --codec=h264 --crf=23 --x264-preset=ultrafast --concurrency=8
```

快渲染版，画质差但 30 秒出片，纯用于"动作时序"检查。

---

## Part IX — 反 Flicker 清单（rendering 失败的 80% 都是这些）

每次 PR review 必过这张表：

| 检查项 | 通过标准 |
| --- | --- |
| 所有动画驱动 | 100% 由 `useCurrentFrame()` 驱动 |
| 图片标签 | 用 `<Img>` 不用 `<img>` |
| 视频标签 | 用 `<OffthreadVideo>` 或 `<Video>`，不用 `<video>` |
| 音频标签 | 用 `<Audio>`，不用 `<audio>` |
| GIF | 用 `<AnimatedImage>` |
| 背景图 | **禁止** `background-image` / `mask-image`，用 `<Img>` + `<AbsoluteFill>` 模拟 |
| 异步数据 | 用 `delayRender()` / `continueRender()` 包起来 |
| 字体加载 | 通过 `@remotion/fonts.loadFont()` |
| 随机数 | 用 `remotion.random()`，不用 `Math.random()` |
| 当前时间 | 用 frame / fps 计算，不用 `Date.now()` |
| 定时器 | **禁止** `setTimeout` / `setInterval` / `requestAnimationFrame` |
| CSS 动画 | **禁止** `transition` / `@keyframes` / `animation` |

---

## Part X — QA Gate（提交前必过）

### 10.1 内部 review checklist

按这个顺序看每一版 master：

1. **第一遍：声音全关，纯视觉**。能不能跟上故事？有没有不知道在演什么的 5+ 秒？
2. **第二遍：视频全关，纯听 VO**。VO 自己能不能成立？信息够不够？
3. **第三遍：完整看，眼睛专门看排版**。字有没有溢出、撞边、错位？
4. **第四遍：完整看，眼睛专门看 motion**。有没有 linear 缓动、同时启动、3+ 元素并发？
5. **第五遍：完整看，耳朵专门听 audio**。VO 有没有爆音？ducking 自然吗？SFX 是不是踩在了视觉关键帧上？

每一遍发现的问题写在 `docs/REVIEW_NOTES.md`，标记 must-fix / should-fix / nice-to-have。

### 10.2 跨设备播放验证

在以下平台播放最终 mp4，全部要正常：

- macOS QuickTime
- Windows Media Player（或 VLC）
- Chrome 浏览器（拖文件进去）
- Safari iOS（先上传到 Drive 再用 Safari 打开）
- Android Chrome（同上）
- 上传 YouTube 后看（编码会被二次压缩，确认还能看）
- 上传 Vimeo（如有）
- 上传 LinkedIn / Twitter（视频被强制压缩后看）

任一平台播放失败 = 重新渲染。最常见的失败原因是 `--pixel-format=yuv420p` 没设。

### 10.3 字幕一致性

- 字幕文字 = VO 文字（逐字对，不要"差不多就行"）
- 字幕出现 ≤ VO 开始 + 4 帧
- 字幕消失 ≥ VO 结束 - 4 帧
- 跨 shot 的字幕样式完全一致

### 10.4 版权检查

- 字体：商用授权确认（Inter 是 OFL 开源，OK；其他字体要查）
- 音乐：商用授权 + 元数据保留
- 图片 / 图标：每张都要有来源记录（即使是开源 SVG）
- 客户 / 用户数据：所有出现的姓名、邮箱、订单号必须是虚构数据（不能 mock 真用户）

---

## Part XI — 交付规范

### 11.1 默认交付物

| 文件 | 用途 | 命名 |
| --- | --- | --- |
| `master_1080p_h264.mp4` | YouTube / 网站 embed / 通用 | 60–120 MB |
| `master_1080p_h265.mp4`（可选） | 文件大小敏感场景 | 30–60 MB |
| `master_4K.mp4`（如 source 是 4K） | YouTube 4K / 高质量展示 | 200–400 MB |
| `social_9x16.mp4`（如需要） | TikTok / Reels / Shorts | 单独 composition，60s 切版 |
| `social_1x1.mp4`（如需要） | Instagram feed | 单独 composition，60s 切版 |

### 11.2 9:16 / 1:1 切版原则

**不要**对 16:9 的 master 做 center crop 出 9:16。crop 后构图全废、文字溢出、人脸偏离。

正确做法：在 Remotion 里**新建一个 9:16 的 composition**，复用大部分组件但重新摆位置（关键文字居中、背景换成 9:16 friendly）。这个 composition 比 master 短（通常 60s），重新讲故事。

### 11.3 归档

最终交付后，把所有交付 mp4 + Remotion 源码 zip 一份归档：

```
archive/
├── 2026-06-XX-final/
│   ├── master_1080p_h264.mp4
│   ├── master_4K.mp4
│   ├── social_9x16.mp4
│   ├── remotion-source.zip   # node_modules 不要
│   ├── public-assets.zip     # 所有 VO / SFX / 字体 / 图片
│   └── CHANGELOG.md          # 这一版的 review notes 汇总
```

归档到团队云盘 + 至少一个团队成员本地。

---

## Part XII — 反模式（做不到 Apple 级的常见原因）

按"杀伤力"从高到低排：

### 12.1 视频反模式

1. **Linear 缓动用于 hero motion** —— 一秒识别业余
2. **3 个以上元素同时启动入场** —— 注意力被瓜分
3. **font-weight 动画** —— 看起来像加载 bug
4. **`background-image` / `mask-image`** —— 渲染时闪烁
5. **`<img>` / `<video>` / `<audio>` 而非 Remotion 版本** —— 渲染时跳帧
6. **字体没用 `@remotion/fonts.loadFont`** —— 渲染出 Times 系统字
7. **CSS transitions / animations** —— 渲染时无法同步

### 12.2 流程反模式

1. **没有 per-shot debug composition** —— 每次迭代渲染 3 分钟
2. **跳过 storyboard 直接写代码** —— 三天后发现 thesis 不对
3. **Render 时才发现颜色不对** —— `--color-space` 没设 `bt709`
4. **没归档 daily master** —— 不能回滚到昨天那版
5. **只在一个平台播放就交付** —— 客户用别的平台播失败

### 12.3 内容反模式

1. **3 分钟讲 5 个 thesis** —— 观众什么都没记住
2. **每 15 秒就 5 秒静默** —— 节奏太慢
3. **每秒都在动 / 每秒都在说话** —— 节奏太密
4. **CTA 在最后 3 秒** —— 已经划走了
5. **logo 出现频率太高** —— 显得自卑

---

## Appendix A — Easing 曲线快查

| 名字 | bezier | 视觉感 | 默认场景 |
| --- | --- | --- | --- |
| **easeOut** | `(0.16, 1, 0.3, 1)` | "啪——长收尾" | 元素入场（80% 场景） |
| easeIn | `(0.4, 0, 1, 1)` | "慢起加速消失" | 元素离场 |
| easeInOut | `(0.4, 0, 0.2, 1)` | 对称 S 曲线 | 同元素状态切换 |
| sharpOut | `(0.4, 0, 0.6, 1)` | 紧凑利落 | 按钮 / icon 微动 |
| slowReveal | `(0.65, 0, 0.35, 1)` | 缓慢庄重 | 长文本浮现 |
| **Easing.bounce** | n/a | 弹跳 | 卡通 / 儿童向（**严肃片不用**） |
| **Easing.elastic** | n/a | 橡皮筋 | 同上 |
| linear | `(0, 0, 1, 1)` | 匀速 | **只用于连续循环** |

可视化工具：https://cubic-bezier.com/ 和 https://remotion.dev/timing-editor

---

## Appendix B — Render commands 速查

```bash
# 最终 master（5-15 min @ 3min 1080p60 with --scale=2）
npx remotion render src/index.ts MasterFilm out/master.mp4 \
  --codec=h264 --crf=16 --x264-preset=slow \
  --pixel-format=yuv420p --color-space=bt709 \
  --image-format=png --scale=2 \
  --audio-bitrate=320k --audio-codec=aac

# 快速预览渲染（30s）
npx remotion render src/index.ts MasterFilm out/preview.mp4 \
  --codec=h264 --crf=23 --x264-preset=ultrafast

# 单 shot 渲染
npx remotion render src/index.ts Shot05 out/shots/shot05.mp4 \
  --codec=h264 --crf=18

# 单帧 PNG（验证构图）
npx remotion still src/index.ts MasterFilm out/golden/frame_3420.png --frame=3420

# 启动 Studio
npx remotion studio
# 或指定端口
npx remotion studio --port=3001
```

---

## Appendix C — 术语速查

| 概念 | 是什么 |
| --- | --- |
| **Composition** | 一个完整可渲染的视频（有 width/height/fps/durationInFrames） |
| **Sequence** | 一段时间窗，子元素只在窗内 mount。`from` + `durationInFrames` 控制位置和长度 |
| **AbsoluteFill** | 填满父容器的 div，多个叠加 = 层 |
| **Series / Series.Sequence** | 顺序播放的 Sequence 集合，自动连接 |
| **useCurrentFrame()** | 当前是第几帧（Sequence 内是相对帧） |
| **useVideoConfig()** | 拿到 fps / width / height / durationInFrames |
| **interpolate(value, [inMin, inMax], [outMin, outMax], opts)** | 把 value 从输入范围映射到输出范围 |
| **spring({ frame, fps, config })** | 物理弹簧值（默认 0→1，可有 overshoot） |
| **delayRender() / continueRender(handle)** | 阻塞渲染，等异步操作完成（数据 / 字体 / 视频元数据） |
| **staticFile(path)** | 拿 `public/` 下文件的 URL |
| **CRF** | Constant Rate Factor，编码质量参数，越低质量越高文件越大 |
| **bt709** | 现代视频颜色标准（替代 CRT 时代的 bt601） |
| **yuv420p** | 像素格式，最广兼容（iOS Safari 必需） |

---

## 文档版本

| 版本 | 日期 | 改动 | 作者 |
| --- | --- | --- | --- |
| 1.0 | 2026-06-02 | 初版 | ClaimIt team |

---

## 文档使用守则

1. 这份文档**强制力 > 个人偏好**。要偏离请走 PR 流程改文档，不要在代码里偷偷违反。
2. 任何新成员第一天必须读完全篇。
3. 每个项目开始前 review 一次，看 Part I 决策是否做了。
4. 每次 master render 前 review Part IX 反 flicker 清单和 Part X QA Gate。
5. 文档自身也是版本化的产物 —— 发现规则有问题，改文档，不要绕过去。
