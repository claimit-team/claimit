/**
 * Pure parsers for the four claim_type draft formats produced by
 * [`apps/claim-agent/src/draft/*.py`](apps/claim-agent/src/draft/). Each
 * parser takes the wire `draft_content` string and returns either a
 * structured result (happy path) or `null` (the renderer falls back
 * to a `<pre>` block on null — never crashes, never silently drops
 * content).
 *
 * Format references pinned to specific generator files:
 *   - email          → `type_a_email.py` L138 (body-only; no `Subject:`
 *                       line — Claim has no `subject` field, the
 *                       generator's `ClaimDraft.subject` is dropped
 *                       on persist)
 *   - chat_script    → `type_b_chat.py` `_format_chat_script` L100-110
 *                       (`{title}\n\nStep 1: ...\n…\n--- IF AGENT
 *                       DECLINES ---\n\nStep N: ...`)
 *   - in_store       → `type_c_in_store.py` `_format_in_store_guide`
 *                       L72-97 (`## In-Store Price Match Guide` heading
 *                       then five **Bolded** sections in fixed order)
 *   - self_service   → `type_d_self_service.py` L297 (JSON of the
 *                       `SelfServiceWalkthrough` Pydantic model)
 *
 * Vitest tests in `draft-parsers.test.ts` pin the happy-path shapes
 * against fixtures lifted directly from these files.
 */

// ---------------------------------------------------------------------------
// chat_script
// ---------------------------------------------------------------------------

export interface ChatScriptParsed {
  title: string;
  mainSteps: string[];
  escalationSteps: string[];
}

/**
 * Split a chat-script `draft_content` block into a title + main steps
 * + escalation steps. Returns null if no `Step N:` lines are found
 * (treated as drift → caller falls back to `<pre>`).
 *
 * Step prefix `Step N:` is colon-suffixed per `type_b_chat.py`
 * `_format_chat_script`; the literal divider `--- IF AGENT DECLINES ---`
 * separates main steps (1-5) from escalation steps (6-7). First non-
 * empty line before the first Step row is the title; missing title is
 * tolerated (renderer just omits the title row).
 */
export function parseChatScript(content: string): ChatScriptParsed | null {
  const lines = content.split("\n");
  let title = "";
  const mainSteps: string[] = [];
  const escalationSteps: string[] = [];
  let seenDivider = false;
  let seenAnyStep = false;
  let titleClaimed = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (line === "--- IF AGENT DECLINES ---") {
      seenDivider = true;
      continue;
    }
    const stepMatch = line.match(/^Step\s+\d+:\s*(.*)$/);
    if (stepMatch) {
      seenAnyStep = true;
      const body = stepMatch[1].trim();
      if (seenDivider) {
        escalationSteps.push(body);
      } else {
        mainSteps.push(body);
      }
      continue;
    }
    // First non-empty pre-step line is the title; subsequent
    // non-step, non-divider lines are appended onto the title
    // (preserves a 2-line title if the generator ever emits one).
    if (!seenAnyStep && !titleClaimed) {
      title = line;
      titleClaimed = true;
    } else if (!seenAnyStep) {
      title = `${title} ${line}`.trim();
    }
  }

  if (!seenAnyStep) return null;
  return { title, mainSteps, escalationSteps };
}

// ---------------------------------------------------------------------------
// in_store
// ---------------------------------------------------------------------------

/**
 * The five section labels (in order) that `_format_in_store_guide`
 * always emits. Match by **position**, not by string, so a future
 * minor rephrase of the bold-label text doesn't break the parser as
 * long as the order is preserved.
 */
export const IN_STORE_SECTION_KEYS = [
  "what_to_say",
  "what_to_bring",
  "talking_points",
  "policy_reference",
  "if_denied",
] as const;
export type InStoreSectionKey = (typeof IN_STORE_SECTION_KEYS)[number];

export interface InStoreSection {
  /** The bolded section label as emitted by the generator, e.g. "What to Bring". */
  heading: string;
  /**
   * Stable identifier — one of the 5 canonical `InStoreSectionKey`
   * values for indexes 0-4, or an index-derived `extra_{idx}` fallback
   * for any section beyond the canonical 5. The widened type ensures
   * unique keys across the parser output even if the generator drifts
   * to more sections.
   */
  key: InStoreSectionKey | `extra_${number}`;
  /** Bullet list items (preserved without the leading `- `). */
  bullets: string[];
  /** Numbered list items (preserved without the leading `1. `). */
  numbered: string[];
  /** Free-form paragraph text (lines that aren't bullets/numbered). */
  paragraphs: string[];
}

export interface InStoreGuideParsed {
  /** The `## ...` heading line (without the `## ` prefix). */
  title: string;
  /** Sections in the order the generator emitted them (1-5). */
  sections: InStoreSection[];
}

/**
 * Parse an in-store guide. Returns null if no `## ` title heading or
 * fewer than two `**Section**` headers are found (treated as drift →
 * caller falls back to `<pre>`).
 */
export function parseInStoreGuide(content: string): InStoreGuideParsed | null {
  const lines = content.split("\n");
  let title = "";
  const sections: { heading: string; bodyLines: string[] }[] = [];
  let currentBody: string[] | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (title === "" && trimmed.startsWith("## ")) {
      title = trimmed.slice(3).trim();
      continue;
    }
    const sectionMatch = trimmed.match(/^\*\*([^*]+)\*\*$/);
    if (sectionMatch) {
      currentBody = [];
      sections.push({ heading: sectionMatch[1].trim(), bodyLines: currentBody });
      continue;
    }
    if (currentBody !== null) {
      currentBody.push(raw);
    }
  }

  if (title === "" || sections.length < 2) return null;

  // Map section bodies into bullets / numbered / paragraphs. Pinned to
  // the generator's fixed 5-section order via IN_STORE_SECTION_KEYS;
  // if the generator emits fewer (rare/legacy), trailing keys are
  // dropped — parser still succeeds.
  //
  // If the generator ever drifts to MORE than 5 sections the trailing
  // sections get a per-index fallback `extra_${idx}` so the section
  // keys stay unique (CodeRabbit minor finding, PR #168: previously
  // every overflow section reused "policy_reference"). Callers should
  // still treat `IN_STORE_SECTION_KEYS` as the canonical first-5 set.
  const parsedSections: InStoreSection[] = sections.map((s, idx) => {
    const bullets: string[] = [];
    const numbered: string[] = [];
    const paragraphs: string[] = [];
    for (const raw of s.bodyLines) {
      const line = raw.trim();
      if (line === "") continue;
      if (line.startsWith("- ")) {
        bullets.push(line.slice(2).trim());
      } else if (/^\d+\.\s/.test(line)) {
        numbered.push(line.replace(/^\d+\.\s+/, "").trim());
      } else {
        paragraphs.push(line);
      }
    }
    return {
      heading: s.heading,
      key: IN_STORE_SECTION_KEYS[idx] ?? `extra_${idx}`,
      bullets,
      numbered,
      paragraphs,
    };
  });

  return { title, sections: parsedSections };
}

// ---------------------------------------------------------------------------
// self_service
// ---------------------------------------------------------------------------

export type SelfServiceSubPattern =
  | "direct_rebook"
  | "cancel_rebook"
  | "form_submit"
  | "portal_request";

export interface SelfServiceWalkthroughParsed {
  platform_display_name: string;
  order_summary: string;
  steps: string[];
  notes: string[];
  sub_pattern: SelfServiceSubPattern | string;
  estimated_minutes: number;
  claim_url: string;
  credit_type: string;
}

/**
 * Required field names emitted by `SelfServiceWalkthrough.model_dump_json()`
 * in `apps/claim-agent/src/draft/type_d_self_service.py` L145-153. Shared
 * with the pre-save validator in `draft-pane.tsx` so the same shape
 * gate fronts both the renderer's parser AND the Save handler.
 */
export const SELF_SERVICE_REQUIRED_FIELDS = [
  "platform_display_name",
  "order_summary",
  "steps",
  "notes",
  "sub_pattern",
  "estimated_minutes",
  "claim_url",
  "credit_type",
] as const;

/**
 * Parse a self-service walkthrough. The wire `draft_content` is JSON
 * (not text), per the generator. Returns null on parse failure or
 * shape mismatch (any of the 8 required fields missing / wrong type)
 * → caller falls back to `<pre>` over the raw JSON string.
 */
export function parseSelfServiceWalkthrough(content: string): SelfServiceWalkthroughParsed | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  for (const field of SELF_SERVICE_REQUIRED_FIELDS) {
    if (!(field in obj)) return null;
  }
  if (typeof obj.platform_display_name !== "string") return null;
  if (typeof obj.order_summary !== "string") return null;
  if (!Array.isArray(obj.steps) || !obj.steps.every((s) => typeof s === "string")) return null;
  if (!Array.isArray(obj.notes) || !obj.notes.every((n) => typeof n === "string")) return null;
  if (typeof obj.sub_pattern !== "string") return null;
  if (typeof obj.estimated_minutes !== "number") return null;
  if (typeof obj.claim_url !== "string") return null;
  if (typeof obj.credit_type !== "string") return null;
  return {
    platform_display_name: obj.platform_display_name,
    order_summary: obj.order_summary,
    steps: obj.steps as string[],
    notes: obj.notes as string[],
    sub_pattern: obj.sub_pattern,
    estimated_minutes: obj.estimated_minutes,
    claim_url: obj.claim_url,
    credit_type: obj.credit_type,
  };
}

/**
 * Lightweight version of `parseSelfServiceWalkthrough` that only
 * checks structural validity. Used by the Edit/Save handler to gate a
 * hand-edited buffer before sending PUT /edit — failing here prevents
 * corrupting the persisted draft into a permanent `<pre>` fallback.
 */
export function isValidSelfServiceJson(buffer: string): boolean {
  return parseSelfServiceWalkthrough(buffer) !== null;
}

/**
 * Extract the three price points from the generator's `order_summary`
 * string format: `"{product} | Paid {p1} → Now {p2} | Save {amt} {currency}"`.
 * Returns null if the format doesn't match (renderer falls back to
 * showing the raw `order_summary` line verbatim).
 */
export interface OrderSummaryParsed {
  product: string;
  paid: string;
  now: string;
  save: string;
  currency: string;
}

export function parseOrderSummary(summary: string): OrderSummaryParsed | null {
  const match = summary.match(/^(.+?)\s\|\sPaid\s(.+?)\s→\sNow\s(.+?)\s\|\sSave\s(.+?)\s(\S+)$/);
  if (!match) return null;
  return {
    product: match[1].trim(),
    paid: match[2].trim(),
    now: match[3].trim(),
    save: match[4].trim(),
    currency: match[5].trim(),
  };
}

// ---------------------------------------------------------------------------
// email — derived subject
// ---------------------------------------------------------------------------

/**
 * The wire `Claim.draft_content` for `claim_type === "email"` is the
 * email body only — `apps/claim-agent/src/draft/type_a_email.py` emits
 * a `ClaimDraft.subject` but claim-agent's finalize step drops it
 * (Claim has no `subject` field). The renderer derives a sensible
 * display-only subject from the purchase order_id; the edit buffer
 * intentionally does NOT include this string so a save can't
 * accidentally persist it into `draft_content`.
 *
 * Flag in PR body: follow-up to either persist `claim.subject`
 * (backend extension) or move this template to a shared util once
 * other call sites need it.
 */
export function deriveEmailSubject(orderId: string): string {
  if (orderId === "") return "Price match refund request";
  return `Price match refund — Order ${orderId}`;
}
