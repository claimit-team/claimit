# Claim Output Types

ClaimIt generates claim materials in four formats, each matched to how a specific platform actually accepts price-match claims. The output type is selected automatically based on the platform's `submission_channel` field in the policy document.

---

## Type Selection

| `submission_channel` | Output Type | Generator |
| --- | --- | --- |
| `email` | Type A — Email | `draft/type_a_email.py` |
| `chat` | Type B — Chat Script | `draft/type_b_chat.py` |
| `in_store` | Type C — In-Store Guide | `draft/type_c_in_store.py` |
| `self_service` | Type D — Self-Service Walkthrough | `draft/type_d_self_service.py` |

---

## Type A — Email

A formatted email ready to send via the user's Gmail or copy manually.

### Structure

| Field | Description |
| --- | --- |
| **Subject** | Concise subject line with order reference (e.g., "Price match refund — Order demo-ord-e273a5c7b4") |
| **Greeting** | Platform-appropriate salutation (e.g., "Hello Best Buy Customer Care,") |
| **Body** | Formal request stating: product purchased, price paid, current lower price, price difference, policy reference |
| **Evidence mention** | Notes that order confirmation and price screenshot are available |
| **Closing** | Professional sign-off |

### Prompt Strategy

- Formal business letter tone
- Must include: order ID, original price, current price, calculated difference, specific policy clause
- Gemini writes placeholder tokens (`{{ORDER_ID}}`, `{{REFUND_AMOUNT}}`, etc.) — Python handles all field insertion after generation

### On Approve

- **Gmail connected**: Sent directly from the user's Gmail after approval
- **Gmail not connected**: User copies the draft and sends manually

---

## Type B — Chat Script

A step-by-step conversation guide for platforms that handle claims through live chat.

### Structure

| Section | Description |
| --- | --- |
| **Title** | Platform + order reference (e.g., "Amazon Price Match — Order demo-ord-5441c5cd19") |
| **Steps 1–N** | Each step is a single chat message the user can copy and send individually |
| **Fallback section** | "If the agent declines or stalls" — alternative approaches |

### Prompt Strategy

- Conversational but direct tone
- Each step is self-contained — the user copies one message at a time using per-step copy buttons
- Steps build on each other: introduce yourself → state the issue → reference the policy → request the specific amount
- Includes fallback guidance if the agent pushes back

### On Approve

- User copies messages step-by-step into the platform's live chat
- Post-approve banner shows "Open [Platform] chat" button (when `policy.claim_url` is available)

---

## Type C — In-Store Guide

A printable guide for platforms that require in-person visits to process claims.

### Structure

| Section | Description |
| --- | --- |
| **Title** | "In-Store Price Match Guide" |
| **What to Say** | Opening statement for the customer service desk |
| **What to Bring** | Checklist: order confirmation, price screenshot, receipt |
| **Talking Points** | Numbered key arguments referencing the policy |
| **Policy Reference** | The specific policy clause with source URL |
| **If Your Claim Is Denied** | Escalation guidance (e.g., "politely ask for a manager") |

### Prompt Strategy

- Concise and actionable — designed to be read on a phone screen or printed
- Talking points are rehearsal-ready, not paragraphs
- Includes the policy URL so the user can show it at the counter

### On Approve

- User downloads or prints the guide
- "Download PDF" button available in the claim header (all statuses)
- Post-approve banner: "Show this guide at the store"

---

## Type D — Self-Service Walkthrough

Click-by-click instructions for platforms with online claim portals.

### Structure

| Section | Description |
| --- | --- |
| **Header** | Platform name, route, estimated time |
| **Price comparison** | PAID / NOW / SAVE boxes with amounts |
| **Steps 1–N** | Literal instructions referencing specific UI elements on the platform's website |
| **Notes** | Eligibility conditions, refund method details, and disclaimers |
| **Action button** | "Open [Platform]" link to start the process |

### Prompt Strategy

- Precise and literal — references specific page names, button labels, and form fields
- Includes the platform URL so the user can follow along
- Estimated completion time helps set expectations

### On Approve

- User follows the steps at their own pace
- The Assistant Agent remains available for help during execution
- Post-approve banner: "~N min to complete at [Platform]" with "Open [Platform]" button

---

## Field Insertion Pattern

All four generators follow the same anti-hallucination pattern:

1. **Gemini generates** the draft with placeholder tokens (`{{ORDER_ID}}`, `{{REFUND_AMOUNT}}`, `{{PLATFORM}}`, `{{POLICY_REFERENCE}}`, etc.)
2. **Python replaces** all placeholders with actual values from the purchase and claim records
3. **Validator checks** that no `{{...}}` tokens remain in the final output

This separation ensures Gemini never fabricates order IDs, dollar amounts, or policy details. The model focuses on tone, structure, and persuasion — the facts are inserted programmatically.

---

## Post-Generation Pipeline

After generation, every draft goes through:

1. **Validation** — placeholder check, ID match, prohibited phrase scan, refund plausibility (see [Claim Agent](claim_agent.md) )
2. **Self-evaluation** — Gemini scores the draft on clarity, tone, accuracy, and completeness (0–10 per dimension, pass threshold ≥ 7)
3. **Version storage** — Draft is saved as a new version in `claims.draft_versions`
4. **Notification** — `claim.drafted` event published to surface the claim in the frontend

---

→ Back to [ClaimIt](../../README.md)  · [Architecture](architecture.md)
