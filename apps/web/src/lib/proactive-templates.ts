/**
 * Proactive prompt templates — frontend mirror of
 * apps/assistant-agent/src/proactive_prompts.py.
 *
 * Why a duplicate of the Python templates instead of consuming them via
 * an API: the api-gateway emits raw NotificationEvent payloads through
 * the events SSE stream. There is no endpoint today that returns
 * pre-rendered ProactiveOutput, and adding one would require backend
 * changes (out of scope per ticket 5.10 spec). These templates are
 * deterministic and cheap to render client-side, so we do.
 *
 * If you change the templates here, mirror the change in the Python
 * file (or factor both onto a shared JSON spec in a future ticket).
 */

import { getPlatformLabel } from "@/lib/platform-labels";
import type { ProactiveOutput } from "@/types/assistant";

type PayloadDict = Record<string, unknown>;

function safeGet(data: PayloadDict, key: string, fallback = "unknown"): string {
  const val = data[key];
  if (val === undefined || val === null) return fallback;
  return String(val);
}

/**
 * Resolve a platform label from a notification's data payload.
 *
 * Mirrors `notification-row.tsx::sniffPlatform`: prefers `data.platform`,
 * falls back to `data.merchant` (some producers — including legacy schema
 * paths and certain Pub/Sub frames — write the slug under `merchant`).
 * Returns `null` when neither key is present so callers can omit the
 * platform clause cleanly instead of rendering the literal "unknown"
 * (BUG-115 finding #3a).
 */
function sniffPlatformLabel(data: PayloadDict): string | null {
  const raw = data["platform"] ?? data["merchant"];
  if (raw === undefined || raw === null || raw === "") return null;
  return getPlatformLabel(String(raw));
}

function safeList(data: PayloadDict, key: string): string[] {
  const val = data[key];
  if (Array.isArray(val)) {
    return val.map((x) => String(x));
  }
  return [];
}

function formatCurrency(amount: unknown): string {
  if (amount === undefined || amount === null) return "$?.??";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "$?.??";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

/**
 * Coerce an unknown payload value to a finite number, or fall back.
 *
 * Notification payloads aren't schema-validated end-to-end; producers may
 * accidentally send `"3"` instead of `3`, or `null`, or NaN-shaped strings.
 * Counts that flow into prompts ("Welcome back! I caught X drops") look
 * broken if "NaN" or "undefined" lands in the user-facing string, so we
 * coerce defensively and fall back to a known-good integer.
 */
function safeNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// The 10 templates — order mirrors NotificationEventType in the backend enums.
// ---------------------------------------------------------------------------

function priceDropped(data: PayloadDict): ProactiveOutput {
  const platform = sniffPlatformLabel(data);
  const amount = formatCurrency(data.refund_amount);
  const hours = safeGet(data, "window_remaining_hours", "?");
  return {
    opening_message: platform
      ? `Your ${platform} item just dropped ${amount}. You have ${hours} hours left in the claim window — want me to file it?`
      : `Your item just dropped ${amount}. You have ${hours} hours left in the claim window — want me to file it?`,
    key_facts: [
      platform ? `Platform: ${platform}` : null,
      `Refund amount: ${amount}`,
      `Window remaining: ${hours} hours`,
    ].filter((fact): fact is string => fact !== null),
    quick_actions: [
      { label: "Review draft", action: "navigate_claim" },
      { label: "Auto-file now", action: "approve_claim" },
    ],
  };
}

function claimDrafted(data: PayloadDict): ProactiveOutput {
  const platform = sniffPlatformLabel(data);
  const amount = formatCurrency(data.refund_amount);
  const claimType = safeGet(data, "claim_type", "claim");
  return {
    opening_message: platform
      ? `I drafted your ${platform} ${claimType} — ${amount} refund. Want me to make it friendlier or explain my reasoning?`
      : `I drafted your ${claimType} — ${amount} refund. Want me to make it friendlier or explain my reasoning?`,
    key_facts: [
      platform ? `Platform: ${platform}` : null,
      `Claim type: ${claimType}`,
      `Refund amount: ${amount}`,
    ].filter((fact): fact is string => fact !== null),
    quick_actions: [
      { label: "Make it friendlier", action: "redraft" },
      { label: "Explain why", action: "explain_claim" },
      { label: "Approve and send", action: "approve_claim" },
    ],
  };
}

function claimQueuedAuto(data: PayloadDict): ProactiveOutput {
  const amount = formatCurrency(data.refund_amount);
  return {
    opening_message: `Auto-sending your ${amount} claim shortly. Want me to stop and let you review first?`,
    key_facts: [`Refund amount: ${amount}`, "Mode: auto-send"],
    quick_actions: [
      { label: "Stop and review", action: "navigate_claim" },
      { label: "Send now", action: "approve_claim" },
      { label: "Cancel", action: "cancel_claim" },
    ],
  };
}

function claimSubmitted(data: PayloadDict): ProactiveOutput {
  const platform = sniffPlatformLabel(data);
  return {
    opening_message: platform
      ? `Your ${platform} claim has been submitted. I'll let you know when there's a response.`
      : `Your claim has been submitted. I'll let you know when there's a response.`,
    key_facts: [platform ? `Platform: ${platform}` : null, "Status: submitted"].filter(
      (fact): fact is string => fact !== null,
    ),
    quick_actions: [{ label: "View claim", action: "navigate_claim" }],
  };
}

function claimDenied(data: PayloadDict): ProactiveOutput {
  const platform = sniffPlatformLabel(data);
  const reason = safeGet(data, "denial_reason_extracted", "not specified");
  return {
    opening_message: platform
      ? `${platform} denied your claim. Reason: ${reason}. Want to try a different approach?`
      : `Your claim was denied. Reason: ${reason}. Want to try a different approach?`,
    key_facts: [platform ? `Platform: ${platform}` : null, `Denial reason: ${reason}`].filter(
      (fact): fact is string => fact !== null,
    ),
    quick_actions: [
      { label: "Appeal stronger", action: "redraft" },
      { label: "Try different angle", action: "redraft" },
      { label: "Mark resolved", action: "resolve_claim" },
    ],
  };
}

function claimResolvedSuccess(data: PayloadDict): ProactiveOutput {
  const platform = sniffPlatformLabel(data);
  const amount = formatCurrency(data.refund_amount);
  const totalRaw = data.monthly_total_savings;
  const facts: string[] = [];
  if (platform) facts.push(`Platform: ${platform}`);
  facts.push(`Refund: ${amount}`);
  let msg = platform ? `🎉 You got ${amount} back from ${platform}!` : `🎉 You got ${amount} back!`;
  if (totalRaw !== undefined && totalRaw !== null) {
    const total = formatCurrency(totalRaw);
    facts.push(`Monthly savings total: ${total}`);
    msg += ` That brings your monthly savings to ${total}.`;
  }
  return {
    opening_message: msg,
    key_facts: facts,
    quick_actions: [
      { label: "See all refunds", action: "navigate_dashboard" },
      { label: "Share", action: "share" },
    ],
  };
}

function lowConfidenceExtract(data: PayloadDict): ProactiveOutput {
  const fields = safeList(data, "low_confidence_fields");
  const confidence = safeGet(data, "overall_min", "?");
  const fieldStr = fields.length > 0 ? fields.join(", ") : "some fields";
  return {
    opening_message: `I extracted a purchase from your email, but I'm not confident about ${fieldStr}. Can you take a quick look?`,
    key_facts: [`Uncertain fields: ${fieldStr}`, `Confidence: ${confidence}`],
    quick_actions: [
      { label: "Confirm and monitor", action: "confirm_purchase" },
      { label: "Edit details", action: "edit_purchase" },
      { label: "Not an order", action: "dismiss_purchase" },
    ],
  };
}

function firstTimeDashboard(data: PayloadDict): ProactiveOutput {
  const platforms = safeList(data, "platforms_monitored");
  const gmail = Boolean(data.gmail_connected);
  const platformStr = platforms.length > 0 ? `${platforms.length} platforms` : "your purchases";
  const source = gmail ? "your Gmail" : "uploads";
  return {
    opening_message: `Hi! I'm watching ${platformStr} via ${source}. Want a quick tour?`,
    key_facts: [
      `Platforms monitored: ${platforms.length}`,
      `Gmail connected: ${gmail ? "Yes" : "No"}`,
    ],
    quick_actions: [
      { label: "Show me how", action: "start_tour" },
      { label: "Upload a receipt", action: "navigate_upload" },
      { label: "Explore on my own", action: "dismiss" },
    ],
  };
}

function userReturnedAfterLongAbsence(data: PayloadDict): ProactiveOutput {
  const drops = safeNumber(data.drops_caught, 0);
  const amount = formatCurrency(data.total_savings_while_away ?? 0);
  return {
    opening_message: `Welcome back! While you were away, I caught ${drops} price drops worth ${amount}.`,
    key_facts: [`Price drops caught: ${drops}`, `Potential savings: ${amount}`],
    quick_actions: [
      { label: "Show me", action: "navigate_dashboard" },
      { label: "Skip", action: "dismiss" },
    ],
  };
}

function consecutiveRejections(data: PayloadDict): ProactiveOutput {
  const count = safeNumber(data.rejection_count, 3);
  return {
    opening_message: `I notice you've rejected ${count} versions of this draft. Want to tell me what tone you're looking for?`,
    key_facts: [`Rejected drafts: ${count}`],
    quick_actions: [
      { label: "Describe what I want", action: "open_chat" },
      { label: "Cancel this claim", action: "cancel_claim" },
    ],
  };
}

const PROACTIVE_TEMPLATES: Record<string, (data: PayloadDict) => ProactiveOutput> = {
  price_dropped: priceDropped,
  claim_drafted: claimDrafted,
  claim_queued_auto: claimQueuedAuto,
  claim_submitted: claimSubmitted,
  claim_denied: claimDenied,
  claim_resolved_success: claimResolvedSuccess,
  low_confidence_extract: lowConfidenceExtract,
  first_time_dashboard: firstTimeDashboard,
  user_returned_after_long_absence: userReturnedAfterLongAbsence,
  consecutive_rejections: consecutiveRejections,
};

/**
 * Map an event_type + data payload to a ProactiveOutput. Returns null
 * for unknown event types so the Floating Panel can suppress the
 * auto-open rather than render a generic placeholder.
 *
 * Defensive about non-dict input — a malformed notification dict won't
 * crash the panel; missing fields render as placeholders.
 */
export function generateProactiveOutput(eventType: string, data: unknown): ProactiveOutput | null {
  const template = PROACTIVE_TEMPLATES[eventType];
  if (!template) return null;
  const safeData =
    typeof data === "object" && data !== null && !Array.isArray(data) ? (data as PayloadDict) : {};
  return template(safeData);
}

/** Event types that trigger the Floating Assistant's proactive surface. */
export const PROACTIVE_EVENT_TYPES = new Set<string>(Object.keys(PROACTIVE_TEMPLATES));
