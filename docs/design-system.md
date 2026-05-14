# ClaimIt Design System

> The visual foundation for every page in ClaimIt.
This document is the source of truth for color, typography, spacing, motion, and component styling.
When generating any spec, v0 prompt, or code, refer to this document.
>

**Last updated:** May 14, 2026
**Owner:** Erdun
**Inspired by:** Mercury, Wise, Stripe Dashboard

---

## 1. Design Principles

ClaimIt is a financial product, but it's not a bank. It handles money users are owed but haven't claimed. The visual system reflects this dual identity:

1. **Trustworthy, not corporate.** Users connect Gmail and let us draft messages on their behalf. The visual language must inspire trust without feeling like a 1990s financial institution.
2. **Calm, not exciting.** Refund claims are quietly satisfying, not flashy. No celebratory animations on every click. Restrained motion. Predictable interactions.
3. **Information-dense where it matters, generous space everywhere else.** Claim lists need density. Dashboard hero numbers need breathing room. Apply density only where users genuinely need to scan many items.
4. **Rightful, effortless, reclaim.** The product emotion is "this money is already yours, I'm just helping you get it." Never "save money" or "deal hunting." Avoid green-discount-store energy. Lean into the seriousness of money that should have come back to you.
5. **Quiet AI.** Assistant is everywhere but it doesn't shout. No purple gradients, no sparkles, no glowing edges. The AI feels like a competent colleague, not a magic wand.

---

## 2. Color System

ClaimIt uses a restrained, two-color brand palette with extensive neutral gray ramps. Built in HSL for easy theme switching.

### 2.1 Brand colors

```css
/* Primary — Deep Navy. Used for primary buttons, links, focus rings, brand emphasis. */
--brand-primary-50:  hsl(217, 33%, 97%);   /* very faint navy tint */
--brand-primary-100: hsl(217, 30%, 92%);
--brand-primary-200: hsl(217, 28%, 82%);
--brand-primary-300: hsl(217, 28%, 65%);
--brand-primary-400: hsl(217, 32%, 45%);
--brand-primary-500: hsl(217, 50%, 30%);   /* base — primary buttons, focus */
--brand-primary-600: hsl(217, 60%, 22%);   /* hover state */
--brand-primary-700: hsl(217, 70%, 17%);   /* pressed state */
--brand-primary-800: hsl(217, 75%, 13%);
--brand-primary-900: hsl(217, 80%, 9%);

/* Accent — Forest Green. Used SPARINGLY for savings reclaimed, success states, positive trends. */
--brand-accent-50:  hsl(142, 50%, 95%);
--brand-accent-100: hsl(142, 50%, 88%);
--brand-accent-200: hsl(142, 50%, 75%);
--brand-accent-300: hsl(142, 55%, 55%);
--brand-accent-400: hsl(142, 60%, 42%);
--brand-accent-500: hsl(142, 65%, 32%);   /* base — savings number color */
--brand-accent-600: hsl(142, 70%, 25%);
--brand-accent-700: hsl(142, 75%, 19%);
--brand-accent-800: hsl(142, 80%, 13%);
--brand-accent-900: hsl(142, 85%, 9%);
```

**Why deep navy + forest green:**

- Navy: trust, finance, stability (Vanguard, Fidelity, Chase all anchor here)
- Forest green: money/savings, but **subdued, not Robinhood-neon**. The green of a freshly stamped passport, not a discount sticker.
- Combination feels like Mercury Bank or Wise. Not like Honey or Rakuten.

### 2.2 Neutral grays (the workhorse)

90% of the UI uses these.

```css
--neutral-0:   hsl(0, 0%, 100%);          /* pure white — page background */
--neutral-50:  hsl(220, 20%, 98%);         /* subtle bg, hover row */
--neutral-100: hsl(220, 18%, 95%);         /* card alt bg, dividers */
--neutral-200: hsl(220, 15%, 90%);         /* borders, separators */
--neutral-300: hsl(220, 12%, 80%);         /* disabled text/borders */
--neutral-400: hsl(220, 10%, 60%);         /* secondary text */
--neutral-500: hsl(220, 10%, 45%);         /* tertiary text, icons inactive */
--neutral-600: hsl(220, 13%, 32%);         /* body text alternate */
--neutral-700: hsl(220, 15%, 22%);         /* body text on white */
--neutral-800: hsl(220, 18%, 14%);         /* headings */
--neutral-900: hsl(220, 22%, 8%);          /* highest emphasis text */
```

**Hue note:** All grays are slightly cool (220° hue, ~10-20% saturation). This makes the neutral palette feel adjacent to the navy primary rather than disconnected. Pure-gray (0% saturation) would clash with the navy.

### 2.3 Semantic colors

```css
--semantic-success: var(--brand-accent-500);  /* same as brand accent — savings, approved */
--semantic-success-bg: var(--brand-accent-50);

--semantic-warning: hsl(35, 90%, 50%);    /* amber — close to deadline, low confidence */
--semantic-warning-bg: hsl(35, 100%, 96%);

--semantic-danger: hsl(0, 70%, 50%);      /* red — denied, error, expired */
--semantic-danger-bg: hsl(0, 80%, 97%);

--semantic-info: hsl(210, 90%, 55%);      /* blue — informational, not action-needed */
--semantic-info-bg: hsl(210, 100%, 97%);
```

**Critical rule:** Semantic colors are used **for states, never for branding**. Red appears only on truly negative outcomes. Don't use red for delete buttons unless deletion is destructive and final. Don't use green for general positive actions — green is reserved for actual reclaimed money.

### 2.4 Dark mode

Dark mode is mandatory for ClaimIt. Three theme modes available to users:

- **Light** — explicit light mode
- **Dark** — explicit dark mode
- **System (default)** — follows OS-level preference

User selection persists across sessions (localStorage). On first visit, default is System.

Implementation: `next-themes` library (already installed in ticket 5.1). Theme class applied to `<html>` element: `.dark` for dark mode, no class for light. All dark-mode tokens scoped under `.dark { ... }` in globals.css.

**Color inversion principle:** Backgrounds darken, text lightens, brand colors LIFT in lightness so they remain visible against dark surfaces. Saturated colors (semantic states, brand accents) cannot stay at the same lightness in dark mode — they need ~25-35% additional lightness to maintain perceived contrast against the dark background.

**Dark-mode neutral tokens:**

```css
.dark {
  --neutral-0:   hsl(220, 25%, 4%);     /* deepest — page background */
  --neutral-50:  hsl(220, 22%, 7%);      /* card/panel surfaces */
  --neutral-100: hsl(220, 18%, 11%);     /* card alt bg, subtle elevation */
  --neutral-200: hsl(220, 15%, 17%);     /* borders, separators */
  --neutral-300: hsl(220, 12%, 28%);     /* disabled text/borders */
  --neutral-400: hsl(220, 10%, 50%);     /* secondary text */
  --neutral-500: hsl(220, 10%, 65%);     /* tertiary text, icons inactive */
  --neutral-600: hsl(220, 12%, 75%);     /* body text alternate */
  --neutral-700: hsl(220, 15%, 85%);     /* body text on dark */
  --neutral-800: hsl(220, 18%, 92%);     /* high-emphasis text */
  --neutral-900: hsl(220, 20%, 97%);     /* highest-emphasis, near-white */
}
```

Notice the inversion: in light mode `--neutral-0` is white (page bg); in dark mode `--neutral-0` is near-black (also page bg). The same token name carries the same semantic role in both modes — pages always use `--neutral-0` for background.

**Dark-mode brand tokens:**

```css
.dark {
  /* Primary navy lifted significantly — darker shades become unreadable on dark bg */
  --brand-primary-50:  hsl(217, 30%, 14%);   /* faint navy tint on dark */
  --brand-primary-100: hsl(217, 35%, 20%);
  --brand-primary-200: hsl(217, 40%, 28%);
  --brand-primary-300: hsl(217, 50%, 40%);
  --brand-primary-400: hsl(217, 60%, 55%);
  --brand-primary-500: hsl(217, 75%, 68%);   /* base — primary buttons, focus */
  --brand-primary-600: hsl(217, 80%, 76%);   /* hover state */
  --brand-primary-700: hsl(217, 85%, 83%);
  --brand-primary-800: hsl(217, 90%, 88%);
  --brand-primary-900: hsl(217, 95%, 93%);

  /* Accent green — same logic, lift into mint range */
  --brand-accent-50:  hsl(142, 30%, 13%);
  --brand-accent-100: hsl(142, 35%, 18%);
  --brand-accent-200: hsl(142, 40%, 25%);
  --brand-accent-300: hsl(142, 50%, 38%);
  --brand-accent-400: hsl(142, 55%, 52%);
  --brand-accent-500: hsl(142, 65%, 65%);    /* base — reclaimed money color */
  --brand-accent-600: hsl(142, 70%, 75%);
  --brand-accent-700: hsl(142, 75%, 82%);
  --brand-accent-800: hsl(142, 80%, 88%);
  --brand-accent-900: hsl(142, 85%, 93%);
}
```

**Dark-mode semantic tokens:**

```css
.dark {
  --semantic-success: var(--brand-accent-500);
  --semantic-success-bg: hsl(142, 35%, 14%);

  --semantic-warning: hsl(35, 80%, 65%);
  --semantic-warning-bg: hsl(35, 40%, 14%);

  --semantic-danger: hsl(0, 70%, 65%);
  --semantic-danger-bg: hsl(0, 40%, 14%);

  --semantic-info: hsl(210, 80%, 70%);
  --semantic-info-bg: hsl(210, 40%, 14%);
}
```

**Dark-mode shadows:**

In dark mode, the navy-tinted shadows of light mode are too subtle to register. Shadows in dark mode use **pure black** at higher opacity:

```css
.dark {
  --shadow-xs:  0 1px 2px 0 rgb(0 0 0 / 0.30);
  --shadow-sm:  0 1px 3px 0 rgb(0 0 0 / 0.40), 0 1px 2px -1px rgb(0 0 0 / 0.30);
  --shadow:     0 4px 12px -2px rgb(0 0 0 / 0.40), 0 2px 4px -2px rgb(0 0 0 / 0.30);
  --shadow-md:  0 8px 24px -4px rgb(0 0 0 / 0.50), 0 4px 8px -2px rgb(0 0 0 / 0.30);
  --shadow-lg:  0 16px 40px -8px rgb(0 0 0 / 0.60);
}
```

**What changes in dark mode (visual summary):**

| Element | Light mode | Dark mode |
| --- | --- | --- |
| Page background | Pure white | `#070b14` (very dark navy-tinted) |
| Card surface | Pure white with border | `#0f1419` (slightly lifted, near-black with navy tint) |
| Body text | `--neutral-700` (dark gray) | `--neutral-700` (light gray, ~85% lightness) |
| Reclaimed $ amount | Forest green `--brand-accent-500` | Mint green `--brand-accent-500` (lifted) |
| Primary button | Deep navy bg, white text | Light blue bg, near-black text |
| Floating Assistant button | Deep navy circle | Light blue circle |
| Card border | `--neutral-200` (subtle gray) | `--neutral-200` (subtle dark gray) |
| Card hover state | `--shadow-sm` (navy-tinted) | `--shadow-sm` (pure black, more opaque) |

**Rules for designing components that work in both modes:**

1. **Never hardcode colors** — always reference tokens via CSS variables (`var(--brand-primary-500)`). Tokens swap automatically.
2. **Test contrast in both modes** — anything you design must pass WCAG AA in both light and dark. The `-neutral-300` color is for disabled states; nothing else should sit on it.
3. **Brand colors are lifted, not inverted** — `-brand-primary-500` is deep navy in light, light blue in dark. Same token, different lightness.
4. **Semantic state backgrounds are dark + saturated in dark mode** — `-semantic-warning-bg` is amber-tinted dark, not light amber. The text on top is the bright amber color.
5. **No pure white in dark mode** — even highest-emphasis text caps at `-neutral-900` which is 97% lightness (`#f5f7fa`ish), never pure `#ffffff`. Pure white is too aggressive against dark backgrounds.

### 2.5 Color usage rules

| Element | Color |
| --- | --- |
| Page background | `--neutral-0` |
| Card / panel background | `--neutral-0` with `--neutral-200` border |
| Section background (alternating) | `--neutral-50` |
| Body text | `--neutral-700` |
| Headings | `--neutral-800` or `--neutral-900` |
| Secondary text | `--neutral-500` |
| Disabled text | `--neutral-300` |
| Primary button | `--brand-primary-500` bg, white text |
| Primary button hover | `--brand-primary-600` |
| Secondary button | `--neutral-100` bg, `--neutral-700` text, `--neutral-200` border |
| Destructive button | `--semantic-danger` bg, white text |
| Link | `--brand-primary-500` |
| Reclaimed money / savings | `--brand-accent-500` (THE ONLY USE) |
| Success state badge | `--semantic-success-bg` bg, `--semantic-success` text |
| Warning state | `--semantic-warning-bg` bg, dark amber text |
| Error state | `--semantic-danger-bg` bg, dark red text |
| Focus ring | `--brand-primary-500` at 50% opacity, 2px |

---

## 3. Typography

### 3.1 Typeface

**Primary:** `Inter` (variable font)
**Fallback stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

**Why Inter, not Geist:**
Geist is excellent but reads as "developer tool" (Vercel-coded). Inter is the financial-product standard (Stripe, Linear, Cash App, Notion all use Inter or near-equivalents). Reads more neutral, more universal.

**Mono (for receipts, IDs, code-like info):** `JetBrains Mono` or `IBM Plex Mono`. Used for: order IDs, transaction numbers, technical fields.

### 3.2 Type scale

```
Display L  — 56px / 64px line-height / 700 weight / -0.02em letter-spacing
Display M  — 44px / 52px / 700 / -0.02em
Display S  — 32px / 40px / 700 / -0.01em

Heading L  — 28px / 36px / 600 / -0.01em
Heading M  — 22px / 30px / 600 / -0.005em
Heading S  — 18px / 26px / 600 / 0

Body L     — 17px / 26px / 400 / 0
Body M     — 15px / 22px / 400 / 0   ← default body
Body S     — 13px / 20px / 400 / 0
Body XS    — 11px / 16px / 500 / 0.02em / uppercase  ← labels, eyebrows

Mono M     — 14px / 22px / 500
Mono S     — 12px / 20px / 500
```

**Density rules:**

- Marketing pages: Body L for hero paragraphs, Body M elsewhere.
- App pages: Body M everywhere by default. Body S for table rows, secondary metadata.
- Dashboard hero numbers: Display M or Display S (specific to dashboard, not other pages).

### 3.3 Numeric display

Money values use **tabular-nums** (CSS: `font-variant-numeric: tabular-nums`) so columns of numbers align. This is non-negotiable for any list/table of dollar amounts.

```css
.tabular {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

Display very large numbers in larger sizes (Display M for "$342 reclaimed this month") but with **lighter weight** (500 instead of 700) for elegance, not aggression. This is a Mercury signature.

---

## 4. Spacing system

8px grid. All padding, margin, gap should be a multiple of 4px (with 8px being the most common base).

```
space-0:   0
space-0.5: 2px
space-1:   4px
space-1.5: 6px
space-2:   8px
space-3:   12px
space-4:   16px
space-5:   20px
space-6:   24px
space-8:   32px
space-10:  40px
space-12:  48px
space-16:  64px
space-20:  80px
space-24:  96px
space-32:  128px
```

**Common patterns:**

- Card internal padding: `space-6` (24px)
- Section gap (between cards): `space-6`
- Page content padding (desktop): `space-12` left/right
- Page content max width: 1280px (centered)
- Form field gap: `space-4` (16px)
- Inline gap between icon and label: `space-2` (8px)

---

## 5. Layout / breakpoints

```
mobile:   < 640px         single column, sidebar becomes drawer
tablet:   640px – 1024px  collapsed sidebar, simplified layouts
desktop:  1024px – 1440px sidebar 240px, main content with margins
wide:     ≥ 1440px        same as desktop, content maxes at 1280px centered
```

Default development viewport: 1280px wide. Mobile target: 375px.

---

## 6. Border radius

Conservative. Financial products use less radius than consumer apps. Compare: Stripe (4-8px max) vs Robinhood (16-24px). We follow Stripe.

```
radius-sm:  4px   /* badges, tags, small chips */
radius:     6px   /* default for buttons, inputs */
radius-md:  8px   /* cards, panels */
radius-lg:  12px  /* large cards, modals */
radius-xl:  16px  /* hero cards, important containers */
radius-full: 9999px  /* avatar, pill badges, circular icons */
```

**Rule:** Never radius > 16px on any rectangular element. Save round shapes for true circles (avatars, status dots).

---

## 7. Shadows

Subtle. Real shadows, not "card with no shadow at all" but never aggressive.

```css
--shadow-xs:  0 1px 2px 0 rgb(15 23 42 / 0.04);
--shadow-sm:  0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04);
--shadow:     0 4px 12px -2px rgb(15 23 42 / 0.06), 0 2px 4px -2px rgb(15 23 42 / 0.04);
--shadow-md:  0 8px 24px -4px rgb(15 23 42 / 0.08), 0 4px 8px -2px rgb(15 23 42 / 0.04);
--shadow-lg:  0 16px 40px -8px rgb(15 23 42 / 0.10);
```

**Usage:**

- Cards at rest: `-shadow-xs` or no shadow (rely on border)
- Hovered card: `-shadow-sm`
- Floating panel (Assistant): `-shadow-md`
- Modal: `-shadow-lg`

Color is tinted toward navy (`rgb(15 23 42)`) instead of pure black for visual coherence with brand.

---

## 8. Motion

Restrained. Financial products demand confidence, not delight-via-animation.

```css
--duration-fast: 120ms;       /* hovers, focus rings */
--duration-base: 180ms;       /* color, opacity changes */
--duration-slow: 280ms;       /* layout shifts, panels opening */
--duration-slower: 420ms;     /* page transitions, modal entry */

--ease-out: cubic-bezier(0.16, 1, 0.3, 1);   /* default — feels confident */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);  /* for symmetric motion */
```

**Rules:**

- Hover state transitions: `-duration-fast --ease-out`
- Slide-over panels (Assistant): `-duration-slow --ease-out`
- Modal entry: `-duration-slower --ease-out`
- Skeleton shimmer: 1.5s linear infinite
- **No bounce, no spring physics, no overshoot.** Confident, decelerated motion only.

**Specific Don'ts:**

- No celebration confetti on successful claim (it's not a game)
- No pulsing glow on attention items (a subtle dot badge is enough)
- No animated number counters (just show the final value)

---

## 9. Component styling fundamentals

### 9.1 Button

```
Heights: 36px (default), 32px (compact), 44px (large)
Padding: horizontal 16px (default), 12px (compact), 20px (large)
Font: Body M (15px), weight 500
Radius: 6px
Min-width: 80px (avoids cramped single-word buttons)
```

**Variants:**

- **Primary:** `-brand-primary-500` bg, white text, shadow-xs at rest
- **Secondary:** `-neutral-100` bg, `-neutral-700` text, `-neutral-200` border
- **Ghost:** transparent bg, `-neutral-700` text, no border, hover bg `-neutral-100`
- **Destructive:** `-semantic-danger` bg, white text — only for irreversible deletes
- **Link:** transparent bg, `-brand-primary-500` text, underline on hover

**Always include:** focus-visible state with 2px brand-primary ring offset 2px.

### 9.2 Input

```
Height: 40px (default), 36px (compact), 48px (large)
Padding: 12px horizontal
Font: Body M (15px)
Radius: 6px
Border: 1px --neutral-200
Focus border: --brand-primary-500
Background: --neutral-0
```

Labels above inputs (not floating). Helper text below at Body S size in `--neutral-500`.

### 9.3 Card

```
Background: --neutral-0
Border: 1px --neutral-200
Radius: 8px (default) / 12px (prominent)
Padding: 24px
Shadow: --shadow-xs at rest, --shadow-sm on hover (if interactive)
```

**Cards that are clickable** (list items): show pointer cursor, raise to `--shadow-sm` on hover, slight `--neutral-50` bg tint. Never animate scale or rotation.

### 9.4 Badge / chip

```
Height: 22px (compact) or 26px (default)
Padding: 8px horizontal
Font: Body S (13px), weight 500
Radius: 4px or pill (9999px)
```

**Usage by status:**

- `monitoring`: neutral bg, `-neutral-600` text
- `awaiting_approval`: amber bg (warning-bg), amber text
- `submitted`: blue bg (info-bg), blue text
- `approved`: green bg (success-bg), green text
- `denied`: red bg (danger-bg), red text

Never use bright saturated badges (Linear's "color all over the place" approach doesn't fit a financial product).

### 9.5 Avatar

Initial-based by default. Background uses a deterministic hash of user_id to pick from a curated set of 6 muted backgrounds (navy variants, gray variants — no bright pinks/oranges). White text initials.

---

## 10. Iconography

**Library:** Lucide React (already installed in our repo).

**Size scale:**

- Inline with text: 16px (matches Body M cap height)
- Button icon: 16px or 18px
- Nav icon: 20px
- Standalone large: 24px

**Style:**

- Stroke width: 1.5px (default). Never use 2px stroke icons — they read as too heavy for a financial product.
- Color: inherits text color (`currentColor`).
- Don't fill icons. Outlined style throughout the app.

---

## 11. Empty states & illustrations

No illustrated empty states for the MVP. Use minimal text + helpful action button.

Example empty state for "no claims yet":

```
[icon: ReceiptText size 48px, color --neutral-300]
[Heading S in --neutral-700]: No claims yet
[Body M in --neutral-500]: ClaimIt monitors your purchases and creates claims when prices drop. Connect Gmail or upload a receipt to start.
[Primary button]: Upload a receipt
```

When the product matures, consider custom line illustrations (single-color, navy-on-white) consistent with the financial-but-not-corporate brand.

---

## 12. Voice & tone (for UI copy)

Not strictly visual but copy is part of the design system.

**Microcopy rules:**

- **Sentence case** for buttons and labels ("Upload receipt", not "Upload Receipt" or "UPLOAD RECEIPT")
- **Money phrasing:** "$50 reclaimed" not "$50 saved". Match the brand emotional positioning.
- **Time phrasing:** "11 days remaining" not "11 days left" (slight formality bump for financial trust)
- **No contractions in error states** ("This action cannot be undone" not "can't be undone") — small formality cue
- **Contractions OK in Assistant responses** (Assistant is the friendly colleague)
- **Action verbs first:** "Approve and send" not "Send (after approval)"
- **Avoid jargon and brand-speak:** Never use "leverage," "synergize," "unlock," "unleash." Use plain words.

---

## 13. Component library mapping

Built on shadcn/ui. The following shadcn components are already installed in our repo (ticket 5.1):

- Button
- Card
- Dialog
- Skeleton
- Badge
- Sonner (Toaster)

Additional shadcn components to install as needed during page implementation:

- Input, Textarea, Select, Checkbox, RadioGroup, Switch (forms)
- Tabs, Accordion (content organization)
- Tooltip, Popover (overlays)
- Avatar (user images)
- Separator (dividers)
- ScrollArea (long lists)
- ResizablePanel (Assistant home, dashboard panes)
- Sheet (mobile sidebar drawer)
- Command (⌘K search palette)

All shadcn components inherit our color tokens via `tailwind.config.ts` and `globals.css` overrides.

---

## 14. What this design system is NOT

- Not Material Design (no elevation tiers, no FAB)
- Not iOS (no big rounded corners, no flat translucent everything)
- Not "modern AI app aesthetic" (no purple gradients, no glow effects)
- Not a discount-app aesthetic (no green sale banners, no urgency timers visualized as fire)
- Not a developer tool aesthetic (no mono-everywhere, no terminal vibes)

ClaimIt looks like Mercury met Stripe, dressed for a finance meeting, slightly tired but quietly confident.

---

## 15. Tokens to export to Tailwind / CSS

These tokens need to be expressed in `apps/web/src/app/globals.css` and referenced via `tailwind.config.ts` extension. The complete token export is the responsibility of ticket 5.3 (Dashboard layout — which is where the first concrete page uses them).

End of document.
