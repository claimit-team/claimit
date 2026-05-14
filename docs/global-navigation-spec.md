# ClaimIt Global Navigation Spec

> The navigation shell that every authenticated page in ClaimIt shares.
Public/marketing pages use a simpler subset (described in §5).
Use this spec when writing per-page specs — each page nests inside this shell.
>

**Last updated:** May 14, 2026
**Owner:** Erdun
**Dependencies:** [design-system.md](http://design-system.md/) must be read first

---

## 1. Layout shell

The authenticated app has a 3-region shell:

```
┌─────────────────────────────────────────────────────────────┐
│  Top header bar (64px tall, sticky)                          │
├──────┬──────────────────────────────────────────────────────┤
│      │                                                       │
│      │                                                       │
│  L   │                                                       │
│  e   │              Page content area                        │
│  f   │              (each page renders here)                 │
│  t   │                                                       │
│      │                                                       │
│  S   │                                                       │
│  i   │                                                       │
│  d   │                                                  ╭──╮│
│  e   │                                                  │💬││ ← Floating
│  b   │                                                  ╰──╯│  Assistant
│  a   │                                                       │  (right edge)
│  r   │                                                       │
└──────┴──────────────────────────────────────────────────────┘
```

**Region widths (desktop, ≥1024px):**

- Left sidebar: 240px (expanded) / 72px (collapsed)
- Top header: 100% width, 64px tall
- Page content: flex-1, with internal max-width 1280px centered
- Floating Assistant button: 56px circle at bottom-right, 24px from edges

**Region widths (mobile, <640px):**

- Sidebar becomes drawer (Sheet component), opens from left on hamburger tap
- Top header: full width, 56px tall (slightly shorter)
- Floating Assistant: same position, 48px button

---

## 2. Top Header Bar

**Purpose:** Identity, search entry point, notifications, account access.

### 2.1 Composition (left-to-right)

```
[Logo]                       [Search input]    [🌙/☀️]   [🔔]    [Avatar]
←32px→                       ←  flex middle  →  16px    16px    16px    16px
```

**Logo (left):**

- Pure icon (no wordmark) — Lucide icon `ShieldCheck` at 28px, color `-brand-primary-500`
- Clicking returns to `/dashboard`
- 32px padding from left edge
- Placeholder until real logo designed

**Search (center, dominant):**

- Wide input field, max 480px wide, centered (or left-aligned if avatar/notifications crowd it)
- Placeholder: "Search claims, purchases, conversations…"
- Right-aligned hint inside input: `⌘K`
- Input is non-functional in MVP — clicking opens the Command palette (shadcn `Command`)
- Command palette content: recently visited pages, "go to" navigation suggestions, eventually searchable claim/purchase IDs
- Background `-neutral-100`, border `-neutral-200`, focus ring `-brand-primary-500`

**Theme toggle (right of search):**

- 32px square button, ghost style
- Lucide icon `Moon` (when current effective theme is light) or `Sun` (when current effective theme is dark)
- Icon size 18px, color `-neutral-500` (matches Bell icon weight)
- Hover bg `-neutral-100`
- Click cycles theme: `light → dark → system → light → ...`
- System mode shows the icon matching what's currently rendered (so user sees a `Moon` icon when system is on light and Sun icon when system is on dark — they're toggling AWAY from current state)
- Subtle tooltip on hover: "Theme: System" (or Light / Dark), with subtext "Click to cycle"
- Same theme selection state is reflected in the Avatar dropdown's chip group — both UIs stay in sync via the shared next-themes context

**Notification icon (right):**

- Lucide `Bell` 20px
- Button styled as ghost (no background until hover, then `-neutral-100`)
- Unread count: small dot badge top-right if any unread, no number — just a 6px `-semantic-warning` filled circle
- Click opens dropdown (see §2.3)

**Avatar (rightmost):**

- 32px circle, initials or photo
- Click opens dropdown (see §2.4)
- 32px padding from right edge

### 2.2 Sticky behavior

Header is sticky at top during scroll. On scroll past 24px, header gets `--shadow-xs` bottom shadow to detach from content. Smooth `--duration-base` transition.

### 2.3 Notification dropdown

Triggered by clicking the bell icon.

```
┌─────────────────────────────────────────┐
│  Notifications              [Mark all read] │  ← header
├─────────────────────────────────────────┤
│  ● Best Buy claim approved              │  ← unread (filled dot)
│    $50 refund · 2h ago                   │
│                                          │
│  ○ Hilton draft ready                   │  ← read (hollow)
│    Approval needed · 4h ago              │
│                                          │
│  ○ Price drop detected on AirPods       │
│    $20 · yesterday                       │
├─────────────────────────────────────────┤
│  See all notifications                  │  ← footer link to /notifications
└─────────────────────────────────────────┘
```

- Width: 360px
- Max 5 items shown, oldest collapsed
- Each item: icon (event-type specific), one-line headline, refund amount + time
- Unread items: subtle `-neutral-50` background tint + filled dot indicator
- Click on item → navigates to entity (claim, purchase) AND marks acknowledged
- "Mark all read" → calls POST /api/v1/notifications/ack-all
- "See all notifications" → routes to `/notifications`

### 2.4 Avatar dropdown

Triggered by clicking avatar.

```
┌─────────────────────────────────────────┐
│  Erdun Eng                              │  ← name
│  erdun@gmail.com                         │  ← email, smaller
├─────────────────────────────────────────┤
│  [chip] Pro plan       Manage           │  ← plan badge + link
├─────────────────────────────────────────┤
│  Settings                                │
│  Help & support                          │
│  ─────                                   │
│  Theme           Light  Dark  System    │  ← theme selector (radio chips)
│  ─────                                   │
│  Sign out                                │
└─────────────────────────────────────────┘
```

- Width: 280px
- Sections separated by 1px `-neutral-200` dividers
- All items are click targets routing to relevant pages
- Theme selector is inline (small chip radio group, no submenu)
- "Sign out" item: text color `-semantic-danger`, hover bg `-semantic-danger-bg`

### 2.4 Avatar dropdown

...

│  Theme           Light  Dark  System    │  ← theme selector (radio chips)

- Width: 280px
- Sections separated by 1px `-neutral-200` dividers
- All items are click targets routing to relevant pages
- Theme selector is inline (small chip radio group, no submenu)
- Theme selector behavior:
    - 3 chips: Light / Dark / System
    - System is the default selection on first visit
    - Selection persists in localStorage via next-themes
    - Switching applies instantly (no page reload), with `-duration-base` color transition
    - Active chip uses `-brand-primary-500` bg + white text
    - Inactive chips use `-neutral-100` bg + `-neutral-700` text, `-neutral-200` border
- "Sign out" item: text color `-semantic-danger`, hover bg `-semantic-danger-bg`

---

## 3. Left Sidebar

**Purpose:** Primary navigation between major app sections.

### 3.1 Composition

```
┌──────────────────────┐
│                       │
│  [collapse toggle]    │  ← top-right, only visible on hover
│                       │
│  MAIN                 │  ← section label, eyebrow style
│  ▸ Dashboard          │
│  ▸ Claims       (3)   │  ← badge: pending-approval count
│  ▸ Purchases          │
│                       │
│  ASSISTANT            │
│  ▸ Assistant          │
│  ▸ Notifications (5)  │  ← badge: unread count
│                       │
│  ACTIONS              │
│  ▸ Upload receipt     │
│                       │
│  ─────────            │  ← divider, pushed near bottom
│                       │
│  ▸ Settings           │
│  ▸ Help               │
│                       │
│  [User pill at bottom]│  ← optional, see §3.5
│                       │
└──────────────────────┘
```

### 3.2 Expanded state (240px)

- Section labels (MAIN, ASSISTANT, ACTIONS): Body XS uppercase, color `-neutral-500`, padding 12px left, top margin 24px (between sections)
- Nav items: 36px height, 12px horizontal padding, 12px between icon and label
- Icon: 20px Lucide outlined
- Label: Body M (15px), color `-neutral-700`
- Active item: bg `-brand-primary-50`, text `-brand-primary-700`, icon `-brand-primary-500`, no left border accent
- Hover item: bg `-neutral-100`, text unchanged
- Badge: pill shape, 22px height, bg `-neutral-200`, text `-neutral-700`, right-aligned in item
- Active item badge: bg `-brand-primary-200`, text `-brand-primary-700`

### 3.3 Collapsed state (72px)

- Section labels: hidden
- Only icons visible, centered
- Active item: same colors but no label
- Tooltip on hover (shadcn `Tooltip`, shows label + badge count if any)
- Toggle button: floats at top-right corner of sidebar, only visible on sidebar hover

### 3.4 Items

| Section | Item | Icon (Lucide) | Route | Badge source |
| --- | --- | --- | --- | --- |
| MAIN | Dashboard | `LayoutDashboard` | `/dashboard` | — |
| MAIN | Claims | `FileText` | `/claims` | pending_approval count |
| MAIN | Purchases | `ShoppingBag` | `/purchases` | — |
| ASSISTANT | Assistant | `Sparkles` | `/assistant` | — |
| ASSISTANT | Notifications | `Bell` | `/notifications` | unread count |
| ACTIONS | Upload receipt | `Upload` | `/upload` | — |
| (bottom) | Settings | `Settings` | `/settings` | — |
| (bottom) | Help | `LifeBuoy` | `/help` | — |

### 3.5 User pill (sidebar bottom)

```
┌──────────────────────────────────┐
│  [avatar] Erdun Eng              │
│           Pro plan               │
└──────────────────────────────────┘
```

- Renders only when sidebar is expanded
- 48px height
- Avatar 32px on left, name + plan on right
- Plan label: Body S, color `-brand-accent-500` if Pro/Family, `-neutral-500` if Free
- Background: `-neutral-50`
- Clickable: opens same dropdown as header avatar
- In collapsed state: only avatar shown, plan badge becomes a tiny dot

### 3.6 Mobile behavior

- Below 1024px: sidebar collapses to icons-only by default
- Below 640px: sidebar disappears entirely, replaced by hamburger button in header that opens a Sheet drawer
- Drawer slides in from left, full height, 280px wide, dims rest of screen
- Sheet header: shows logo + close button
- Sheet body: same nav structure as expanded sidebar
- Tap any nav item closes the drawer and navigates

### 3.7 Active state detection

Active item is determined by route prefix match:

- `/dashboard` → Dashboard active
- `/claims*` → Claims active (including `/claims/:id`)
- `/purchases*` → Purchases active
- `/assistant*` → Assistant active
- `/notifications` → Notifications active
- `/upload*` → Upload receipt active
- `/settings*` → Settings active
- `/help*` → Help active

---

## 4. Floating Assistant Panel

**Purpose:** Universal access to ClaimIt's AI assistant. Both passive (user-initiated) and proactive (system-initiated).

### 4.1 Floating button (entry point)

- 56px circle (48px on mobile)
- Position: fixed, bottom-right, 24px from edges
- Background: `-brand-primary-500`
- Icon: Lucide `Sparkles` 24px white
- Shadow: `-shadow-md`
- Hover: scale 1.04, shadow `-shadow-lg`, background `-brand-primary-600`
- z-index: above page content (10), below modal (50)
- Pulse animation: only when a new unhandled proactive event is queued — subtle 2-pixel ring animating outward, 2s loop, color `-brand-accent-500`

### 4.2 Slide-over panel (on click or proactive trigger)

```
┌────────────────────────────────┐
│  Assistant            [_] [✕]  │  ← header: minimize + close
│  Mode: General                  │  ← subtle mode indicator
├────────────────────────────────┤
│                                 │
│  Assistant message bubble       │
│                                 │
│  User message bubble (right)    │
│                                 │
│                                 │
│  ...                            │
│                                 │
├────────────────────────────────┤
│  [+]  Type a message…    [➤]   │  ← input row
└────────────────────────────────┘
```

- Width: 440px (desktop), full width minus 24px margin (mobile)
- Position: slides in from right edge
- Height: 100% of viewport minus header (64px)
- Animation: slide-in `-duration-slow --ease-out`
- Backdrop: none (panel doesn't dim content — user can still interact with the page)
- Background: `-neutral-0`
- Left border: 1px `-neutral-200`
- Shadow: `-shadow-md` on left edge

**Panel header:**

- Title: "Assistant" + mode indicator subline
- Minimize button: collapses panel back to floating icon
- Close button: closes panel (next open returns to fresh state if conversation finished)

**Mode indicator (subtle):**

- Body XS color `-neutral-500`, below title
- "Mode: General" or "Mode: Claim" or "Mode: Proactive"
- Tooltip on hover explaining what each means

**Mode auto-switching:**

| Current route | Mode |
| --- | --- |
| `/claims/:id` | Claim-focused (Mode B), preloads that claim's context |
| `/purchases/:id` | Purchase-focused (Mode B variant), preloads that purchase |
| `/dashboard`, `/claims`, `/purchases`, everywhere else | General (Mode A) |
| Proactive trigger (any route) | Proactive (Mode C), overrides current mode |

**Conversation continuity:**

- One conversation per claim (Mode B): same conversation shared between Floating Panel and Three-pane Approval UI
- General conversations (Mode A): one continuous thread per session, archived if dormant 7+ days
- Proactive events: append to the appropriate mode's thread (claim-related → that claim's thread; general → Mode A thread)

### 4.3 Proactive event auto-open

When a NotificationEvent arrives via SSE for the current user:

1. **If event is critical** (`price_dropped`, `claim_drafted`, `claim_denied`, `claim_resolved_success`, `claim_queued_auto`):
    - Floating button starts pulse animation
    - After 800ms (a beat for user to notice), panel auto-opens with the proactive message
    - User can dismiss back to icon, or engage further
2. **If event is informational** (`first_time_dashboard`, `user_returned_after_long_absence`):
    - No auto-open, but pulse animation appears
    - User must click to engage
3. **If event is silent** (`claim_submitted`):
    - No UI change at all — surfaces only if user opens panel for unrelated reasons

**Proactive message structure** (rendered as Assistant's first message):

```
┌──────────────────────────────────────┐
│  [event_type icon]                    │
│                                       │
│  Opening line (1-2 sentences)         │
│                                       │
│  Key facts (bullet list):             │
│  • $50 refund                         │
│  • 11 days remaining                  │
│  • Best Buy                           │
│                                       │
│  [Action 1] [Action 2] [Action 3]    │  ← quick action buttons
└──────────────────────────────────────┘
```

- Quick actions are full-width pills inside the message bubble
- Tapping a quick action: marks event acknowledged, executes the action (navigate / approve / open claim detail / etc.)

### 4.4 Dismissal & state

- **Dismiss (close button):** panel closes, returns to floating button, conversation persists
- **Minimize:** same as dismiss but keeps panel state ready to resume
- **Dismiss proactive:** marks current NotificationEvent acknowledged (`POST /api/v1/notifications/:id/ack`)
- **Mute event type:** in panel options menu, user can mute future events of this type (writes to user.notification_preferences)

State persistence:

- Zustand store: panel open/closed, current mode, current conversation_id, queue of unacknowledged proactive events
- On page refresh, panel returns to closed state but proactive events that haven't been acknowledged re-trigger pulse animation

### 4.5 Where the panel is NOT shown

- `/login`, `/onboarding/*` — user has no auth context yet
- Marketing pages (`/`, `/pricing`, `/team`, etc.) — public pages have no Assistant
- `/assistant` and `/assistant/:conversationId` — the full-screen Assistant page is itself an assistant interface, so the floating panel is redundant and hidden

---

## 5. Public / marketing layout

Authenticated shell does NOT apply to public pages. Public pages use a different layout:

```
┌─────────────────────────────────────────────────────────┐
│  Header bar (white bg, transparent on scroll-top)        │
│   [Logo]    Pricing  How it works  Team       [Sign in]  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│             Page content (1080px max-width)               │
│                                                           │
├─────────────────────────────────────────────────────────┤
│  Footer (5-column grid)                                   │
│   Product     Company     Resources  Legal     Newsletter │
└─────────────────────────────────────────────────────────┘
```

### 5.1 Public header

- Logo + 3 horizontal nav links (Pricing, How it works, Team)
- Right side: [Sign in] button (ghost) + [Try free] button (primary)
- Sticky at top, transparent at page top, gains white bg + shadow-xs on scroll past hero
- Mobile: hamburger menu on left side

### 5.2 Public footer

```
ClaimIt logo + tagline                     Stay informed
                                            [email input] [Subscribe]

Product          Company         Resources         Legal
- Pricing        - About         - Blog            - Privacy
- How it works   - Team          - Help            - Terms
- Security       - Careers       - Changelog       - Cookies
- API (soon)     - Contact

────────────────────────────────────────────────────────────
© 2026 ClaimIt, Inc.    San Francisco · Miami            [social links]
```

- Background: `-neutral-50`
- Top border: 1px `-neutral-200`
- 5-column grid on desktop, 2-column on tablet, 1-column on mobile
- Newsletter signup: simple email input + button, no consent checkbox needed for newsletter only (will add cookie banner separately if regulations require)
- Social links: Twitter/X, LinkedIn, GitHub — small icons, color `-neutral-400`, hover `-neutral-700`

### 5.3 Routes that use public layout

```
/                  Landing
/pricing           Pricing
/how-it-works      How it works
/team              Team
/careers           Careers (and /careers/:slug)
/help              Help / FAQ
/help/contact      Contact
/security          Security & Privacy
/privacy           Privacy policy
/terms             Terms of Service
/blog              Blog (and /blog/:slug)
/changelog         Changelog
/login             Login (uses public header only, no footer)
```

### 5.4 Routes that use authenticated layout

```
/dashboard
/claims*
/purchases*
/upload
/confirm/:id
/notifications
/assistant*
/settings*
```

### 5.5 Routes that use onboarding layout (different from both)

Onboarding (`/onboarding/*`) uses a minimal stripped layout — no sidebar, no Assistant. Just a centered card with a step indicator. Detailed in the onboarding page spec.

---

## 6. Responsive behavior summary

| Viewport | Header height | Sidebar | Floating panel | Public footer cols |
| --- | --- | --- | --- | --- |
| < 640px (mobile) | 56px | Drawer (hamburger) | 48px button, 100vw panel | 1 column |
| 640px – 1024px (tablet) | 64px | Collapsed (72px) | 56px button, 440px panel | 2 columns |
| ≥ 1024px (desktop) | 64px | Expanded (240px) | 56px button, 440px panel | 5 columns |
| ≥ 1440px (wide) | 64px | Expanded (240px) | 56px button, 440px panel | 5 columns |

---

## 7. Cross-cutting accessibility

- All interactive elements: keyboard accessible, tab order respects visual order
- Focus ring: 2px `-brand-primary-500` at 50% opacity, offset 2px (per design system §9.1)
- Sidebar nav: rendered as semantic `<nav>` with `aria-label="Main navigation"`
- Each nav section: rendered as `<ul>` with section heading as `<h2 class="sr-only">`
- Notification badge: `aria-label="N unread notifications"` overrides the dot's lack of text
- Floating Assistant button: `aria-label="Open AI assistant"`
- Assistant panel: `role="dialog"` `aria-modal="false"` (it's non-modal — doesn't block page interaction), labeled by panel title
- Mode indicator changes: announced via `aria-live="polite"` region
- All icon-only buttons have `aria-label`
- ⌘K palette: native `<dialog>` element under the hood, accessible by keyboard

---

## 8. Token references

The styling for all elements in this spec is grounded in [design-system.md](http://design-system.md/) tokens. When implementing, reference the design system rather than hardcoding values.

Key token mappings used here:

```
Header bg: --neutral-0
Header border-bottom: --neutral-200 (1px)
Sidebar bg: --neutral-0
Sidebar border-right: --neutral-200 (1px)
Active nav item bg: --brand-primary-50
Active nav item text: --brand-primary-700
Hover nav item bg: --neutral-100
Section eyebrow color: --neutral-500
Floating button bg: --brand-primary-500
Floating button shadow: --shadow-md
Floating panel bg: --neutral-0
Floating panel border-left: --neutral-200 (1px)
Floating panel shadow: --shadow-md
Footer bg: --neutral-50
Footer border-top: --neutral-200 (1px)
```

---

## 9. What this spec does NOT cover

- Specific page contents (each page has its own spec)
- Animations beyond duration/easing (handled per-page if specific motion needed)
- Onboarding flow internals (separate spec)
- Three-pane approval UI internal layout (claim detail page spec)
- Empty states (per page)
- Loading states (per page, with skeleton patterns from design system)

End of document.
