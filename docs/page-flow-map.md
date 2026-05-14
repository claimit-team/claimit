# ClaimIt Page Flow Map

> Describes the relationships between all 36 pages of ClaimIt.
Use this when writing per-page specs so each page understands what comes before and after.
This is NOT a detailed spec for any single page — it's the connective tissue.
>

**Last updated:** May 14, 2026
**Owner:** Erdun
**Dependencies:** read design-system.md and global-navigation-spec.md first

---

## 1. Visitor states

Every user interaction with ClaimIt happens in one of four states:

1. **Anonymous visitor** — never signed in, exploring marketing pages
2. **Onboarding user** — signed up, in setup flow, hasn't completed configuration
3. **Authenticated user** — has completed onboarding, full product access
4. **Logged out** — previously authenticated, now signed out

Layout shell varies by state:

- Anonymous + Logged out → Public layout (header with marketing nav, no sidebar, footer with 5 columns)
- Onboarding → Stripped layout (centered card, step indicator, no sidebar, no Assistant)
- Authenticated → Full app shell (top header, left sidebar, floating Assistant)

---

## 2. The complete page list

Grouped by user state. Each page noted with its primary purpose and key incoming/outgoing flows.

### 2.1 Public pages (anonymous + logged out)

| # | Route | Page | Purpose |
| --- | --- | --- | --- |
| 1 | `/` | Landing | Hero pitch, social proof, CTAs to sign up |
| 2 | `/pricing` | Pricing | Free / Pro / Family tier comparison |
| 3 | `/how-it-works` | How it works | Product mechanics explained |
| 4 | `/team` | Team | Founders + advisors |
| 5 | `/careers` | Careers | Open roles list |
| 6 | `/careers/:slug` | Job detail | Single role details + apply |
| 7 | `/help` | Help / FAQ | Searchable help center |
| 8 | `/help/contact` | Contact support | Form + email |
| 9 | `/security` | Security | Data handling, OAuth scopes, encryption |
| 10 | `/privacy` | Privacy policy | Legal — privacy |
| 11 | `/terms` | Terms of Service | Legal — terms |
| 12 | `/blog` | Blog | Product updates, case studies |
| 13 | `/changelog` | Changelog | Release notes |
| 14 | `/login` | Login | Google sign-in entry |

### 2.2 Onboarding pages (just-signed-up)

| # | Route | Page | Purpose |
| --- | --- | --- | --- |
| 15 | `/onboarding` | Welcome | Value intro + "let's begin" |
| 16 | `/onboarding/gmail` | Connect Gmail | OAuth handshake explanation + button |
| 17 | `/onboarding/preferences` | Send preference | Choose auto-send vs approval |
| 18 | `/onboarding/upload` | First receipt | Optional manual upload to seed product |

### 2.3 Main app — data views (authenticated)

| # | Route | Page | Purpose |
| --- | --- | --- | --- |
| 19 | `/dashboard` | Dashboard home | Activity overview, savings widget, attention items |
| 20 | `/claims` | Claims list | All claims, filterable + searchable |
| 21 | `/claims/:id` | Claim detail | Three-pane approval UI, single claim |
| 22 | `/purchases` | Purchases list | All purchases being monitored |
| 23 | `/purchases/:id` | Purchase detail | Single purchase, price history, related claims |

### 2.4 Main app — operations

| # | Route | Page | Purpose |
| --- | --- | --- | --- |
| 24 | `/upload` | Upload receipt | Manual receipt upload (alternative to Gmail) |
| 25 | `/confirm/:purchaseId` | Confirm extraction | User reviews low-confidence extracted fields |
| 26 | `/notifications` | Notification center | All NotificationEvents history |

### 2.5 Assistant

| # | Route | Page | Purpose |
| --- | --- | --- | --- |
| 27 | `/assistant` | Assistant home | Full-screen ChatGPT-style chat |
| 28 | `/assistant/:conversationId` | Conversation detail | Specific past conversation |

### 2.6 Settings

| # | Route | Page | Purpose |
| --- | --- | --- | --- |
| 29 | `/settings` | Settings home | Redirects to /settings/account |
| 30 | `/settings/account` | Account | Name, avatar, email |
| 31 | `/settings/gmail` | Gmail connection | OAuth status, disconnect, reconnect |
| 32 | `/settings/preferences` | Send preferences | Auto/approval, per-platform overrides |
| 33 | `/settings/notifications` | Notification settings | Per-event-type mute toggles, channels (email/push) |
| 34 | `/settings/billing` | Plan & Billing | Free/Pro/Family status, upgrade, invoices |

### 2.7 Errors

| # | Route | Page | Purpose |
| --- | --- | --- | --- |
| 35 | `*` | 404 | Page not found |
| 36 | (error boundary) | 500 | Server error |

---

## 3. Entry points — how users arrive

ClaimIt has four primary entry points:

### 3.1 Marketing entry

```
User clicks ClaimIt link / search result / referral
  → /  (Landing)
  → from Landing, three CTAs:
    → "Try free" button → /login (then onboarding)
    → "See pricing" link → /pricing
    → "How it works" link → /how-it-works
```

### 3.2 Direct sign-in entry

```
Returning user types claimit.app/login or clicks Sign in
  → /login
  → Google OAuth screen
  → if first time: → /onboarding (full setup flow)
  → if returning: → /dashboard
```

### 3.3 Email notification entry

```
User receives email from ClaimIt (e.g., "Your claim was approved")
  → email contains deep link
  → click → /claims/:id  (or /confirm/:purchaseId, depending on event)
  → if not signed in: prompted to /login first, then deep-linked
```

### 3.4 Push notification entry (post-MVP)

```
Browser push notification ("Best Buy claim drafted")
  → click → /claims/:id (or /notifications)
```

---

## 4. Onboarding flow (linear forward path)

Once user signs in for the first time, they follow this strict sequence. No skipping ahead.

```
/login (Google OAuth)
   ↓ (first-time user detected)
/onboarding (Welcome)
   "Get started" button
   ↓
/onboarding/gmail
   "Connect Gmail" → Google OAuth → returns here when done
   "Skip for now" → goes to /onboarding/upload
   ↓
/onboarding/preferences  (after Gmail connected, or skipped)
   Choose: Auto-send vs Approval mode
   "Continue"
   ↓
/onboarding/upload  (optional)
   "Upload a receipt" → file picker → returns here on upload success
   "I'll do this later" → skip
   ↓
/dashboard  (onboarding complete)
   First-time-dashboard NotificationEvent fires
   Proactive Assistant opens with "Welcome! I'm watching X platforms…"
```

Onboarding cannot be re-entered. If user wants to reconnect Gmail or change preferences after completing, they go to `/settings/*`.

---

## 5. Main app — the daily flows

This is what users actually do day-to-day.

### 5.1 The morning check flow (most common)

```
User opens ClaimIt (any time of day)
  → /dashboard
  → sees "Reclaimed this month: $342" hero
  → sees "Needs your attention" cards (3 active claims)
  → clicks a claim card
  → /claims/:id (three-pane approval UI)
  → reviews draft, types in Assistant pane "make it friendlier"
  → draft updates live
  → clicks "Approve and send"
  → confirmation toast, returns to /dashboard or stays on /claims/:id
```

### 5.2 The proactive event flow (system-initiated)

```
User is on any authenticated page (let's say /purchases)
  → Monitor Agent detects price drop in background
  → NotificationEvent written to DB
  → SSE pushes event to user's browser
  → Floating Assistant icon pulses (subtle 2-pixel ring outward)
  → after 800ms delay, slide-over panel opens automatically
  → Assistant shows: "Your Best Buy MacBook dropped $50. Want me to file the claim?"
  → user clicks "Review draft"
  → navigates to /claims/:id
  → continues in three-pane UI from there
```

### 5.3 The Gmail-ingest flow (passive)

```
User receives a Best Buy order email (no action by user)
  → Gmail Pub/Sub fires
  → Ingest Agent extracts fields
  → if confidence >= 0.95: purchase auto-added, status=monitoring, no UI surface
  → if confidence < 0.95: NotificationEvent (low_confidence_extract) created
    → user opens ClaimIt later
    → Proactive Assistant opens with "I extracted this but I'm not sure about [field]…"
    → quick action "Confirm"
    → /confirm/:purchaseId
    → user reviews/edits fields, clicks "Confirm and monitor"
    → returns to /dashboard
```

### 5.4 The manual upload flow

```
User has a receipt that didn't come through Gmail
  → /dashboard → sidebar → "Upload receipt"
  → /upload (file picker)
  → drag-and-drop PDF or image
  → upload + Ingest Agent processes
  → if high confidence: → /purchases/:id (newly added)
  → if low confidence: → /confirm/:purchaseId
```

### 5.5 The Assistant chat flow (passive, full-screen)

```
User wants to ask the Assistant something without distraction
  → sidebar → "Assistant"
  → /assistant (full-screen, conversation history on left)
  → "New conversation" button → fresh thread
  → types question → SSE streaming reply
  → multiple conversations persist in left sidebar over time
  → clicking any past conversation → /assistant/:conversationId
```

### 5.6 The settings flow

```
User wants to change preferences or check connection status
  → top header → avatar → "Settings"
  → /settings (auto-redirects to /settings/account)
  → /settings/account (default landing)
  → sidebar nav (within settings) has: Account / Gmail / Preferences / Notifications / Billing
  → user picks one, makes change, clicks Save
  → toast confirms
```

Settings sidebar is **nested inside** the main app shell — top header + left sidebar (Settings highlighted) stay visible, with a secondary nav for the settings sub-pages.

### 5.7 The notification review flow

```
User wants to see what happened recently
  → top header → bell icon → dropdown shows 5 most recent
  → click "See all notifications" → /notifications
  → /notifications shows full history, filterable
  → user clicks a notification → navigates to related entity (/claims/:id, /purchases/:id, etc.)
  → notification auto-marked acknowledged
```

---

## 6. Navigation relationships (page → page)

### 6.1 From Landing (`/`)

Outgoing:

- → `/pricing` (Pricing link, hero CTA)
- → `/how-it-works`
- → `/team`
- → `/careers`
- → `/login` (Sign in)
- → `/login` (Try free → first-time onboarding)

Incoming:

- External traffic (search, referral, ads)
- ClaimIt logo click from any public page

### 6.2 From Login (`/login`)

Outgoing:

- → `/onboarding` (first-time user)
- → `/dashboard` (returning user)
- → `/` (back/cancel link)

Incoming:

- From `/` (Try free / Sign in)
- From any public page header (Sign in)
- From email deep-link auth gate

### 6.3 From Dashboard (`/dashboard`)

Outgoing:

- → `/claims/:id` (click claim card in "Needs your attention")
- → `/claims` (View all claims link)
- → `/purchases` (View all purchases)
- → `/notifications` (bell icon top header, or sidebar)
- → `/upload` (sidebar, or empty state CTA)
- → `/assistant` (sidebar)
- → `/settings/*` (top header avatar dropdown)
- → `/purchases/:id` (recent purchase card click)
- → Floating Assistant (any page)
- → `/login` (sign out → returns here on logout)

Incoming:

- From onboarding completion
- From login (returning users)
- From any sidebar Dashboard link
- From logo click in top header
- From a back-after-action (e.g., after approving a claim, may return to dashboard)

### 6.4 From Claims list (`/claims`)

Outgoing:

- → `/claims/:id` (click a claim row)

Incoming:

- From sidebar Claims link
- From Dashboard "View all claims"

### 6.5 From Claim detail (`/claims/:id`)

Outgoing:

- → `/purchases/:id` (linked purchase in center pane)
- → `/dashboard` (back / breadcrumb)
- → `/claims` (back / breadcrumb)
- → External: Best Buy chat URL (when user clicks "Open Best Buy chat" after approving Type B)
- → External: Email client (when user clicks "Send email" after Type A, with Gmail Send API)
- → External: Self-service URL (Type D walkthrough's "Open Southwest" link)
- → External: PDF print (Type C in-store guide)

Incoming:

- From `/claims` (list click)
- From `/dashboard` (card click)
- From `/notifications` (notification click)
- From Floating Assistant proactive (Mode C event)
- From email notification deep link

### 6.6 From Purchase detail (`/purchases/:id`)

Outgoing:

- → `/claims/:id` (related claim card)
- → `/purchases` (back to list)
- → `/dashboard` (breadcrumb)

Incoming:

- From `/purchases` (list click)
- From `/dashboard` (related purchase card)
- From `/claims/:id` (linked purchase link)

### 6.7 From Confirm extraction (`/confirm/:purchaseId`)

Outgoing:

- → `/purchases/:id` (after confirm — newly monitoring purchase)
- → `/dashboard` (after dismiss / "not an order")

Incoming:

- From low_confidence_extract NotificationEvent proactive
- From email notification deep link
- From `/upload` (if confidence < threshold after manual upload)

### 6.8 From Assistant home (`/assistant`)

Outgoing:

- → `/assistant/:conversationId` (click a past conversation in sidebar)
- → other app pages if Assistant suggests navigation in chat

Incoming:

- From sidebar Assistant link
- From in-conversation deep links

### 6.9 From Settings pages

Each settings sub-page (`/settings/account`, etc.):

Outgoing:

- → Sibling settings sub-pages via secondary nav
- → `/dashboard` (Cancel / back button)
- → `/login` (Sign out from account)

Incoming:

- From top header avatar dropdown
- From sidebar Settings link

### 6.10 From Notifications (`/notifications`)

Outgoing:

- → `/claims/:id` (claim-related notification click)
- → `/purchases/:id` (purchase-related click)
- → `/settings/notifications` (mute toggle / settings link)

Incoming:

- From bell icon dropdown "See all"
- From sidebar Notifications link

---

## 7. Special flows

### 7.1 The auto-send 5-minute window

A Hilton claim is in `queued_for_send` status with a 5-minute countdown.

```
User on /dashboard sees a banner: "Sending Hilton claim in 4:32 — [Review] [Send now] [Cancel]"
  → user clicks Review → /claims/:id (three-pane UI)
  → user clicks Cancel → toast, returns to /dashboard, claim status = approval_required
  → user clicks Send now → claim sent immediately, status = submitted
  → user does nothing → countdown completes, claim sent, status = submitted
```

A Floating Assistant proactive (Mode C) ALSO fires for `claim_queued_auto` — it appears with the same options, even if user navigates away from dashboard.

### 7.2 Authentication boundary

Any authenticated route accessed without a valid session:

```
User navigates to /claims/abc123 with no session
  → middleware detects no auth
  → store intended destination in URL: /login?next=/claims/abc123
  → /login (Google OAuth)
  → on success, redirect to stored destination → /claims/abc123
```

This applies to ALL authenticated routes. Settings pages, dashboard, all of them.

### 7.3 Logout flow

```
User clicks Sign out (from top header avatar dropdown OR /settings/account)
  → confirm dialog (optional, prevents accidental clicks)
  → clear session
  → redirect to / (Landing)
  → if user was on a protected page, that URL is forgotten
```

### 7.4 Empty states (per page)

If a user has no claims yet, `/claims` shows:

- Empty state illustration (none for MVP — just icon + text)
- CTA: "Upload your first receipt" → `/upload`
- Or: "Connect Gmail" → `/settings/gmail` (if not already connected)

Empty states never trap the user — there's always a clear next action.

### 7.5 Error pages

- `/404` for unknown routes → "Page not found" + button "Go to dashboard"
- `/500` from error boundary → "Something went wrong" + button "Reload" + "Contact support" (→ `/help/contact`)

---

## 8. Routing rules summary

| Rule | Applies to |
| --- | --- |
| Authenticated routes require valid session, redirect to `/login?next=` if not | All `/dashboard`, `/claims*`, `/purchases*`, `/upload`, `/confirm/*`, `/notifications`, `/assistant*`, `/settings*` |
| Onboarding routes block dashboard access if not complete | `/onboarding*` requires `users.onboarded === false` |
| Onboarding routes redirect to dashboard if already complete | Direct access to `/onboarding` after completion → `/dashboard` |
| Login already-authenticated redirect | `/login` while signed in → `/dashboard` |
| Public routes available regardless of auth | `/`, `/pricing`, `/how-it-works`, `/team`, `/careers*`, `/help*`, `/security`, `/privacy`, `/terms`, `/blog*`, `/changelog` |
| Settings home redirect | `/settings` → `/settings/account` |
| Deep links survive auth gate | Email links to `/claims/:id` → `/login?next=/claims/:id` → back to claim after auth |

---

## 9. What this map does NOT specify

This document is the **shape** of the product — not the **content** of any single page. For each page's:

- Visual layout
- Specific components
- Data fields and binding
- Empty/loading/error states
- Component interactions

→ See the per-page spec for that page.

GPT writing a per-page spec should pull from THREE sources:

1. `design-system.md` (visual tokens)
2. `global-navigation-spec.md` (shell behavior)
3. `page-flow-map.md` (THIS doc — where this page sits in the product)

Plus the user-supplied "page direction" for that specific page (covering what data, what interactions, what density).

End of document.
