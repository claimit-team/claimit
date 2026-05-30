/**
 * Client-side carrier for an uploaded-but-unconfirmed receipt
 * (write-after-confirm flow).
 *
 * The upload endpoint persists NOTHING to MongoDB — it returns the
 * extracted fields, which the confirm form renders before the user
 * commits. We park that payload in `sessionStorage` under a random
 * staging key and route to `/confirm/<key>`. The confirm loader reads it
 * back (survives the navigation and a refresh, unlike router state, and
 * keeps extracted PII out of the URL). On a successful create — or when
 * the user cancels — the entry is cleared.
 *
 * The `/confirm/:key` route param is EITHER one of these staging keys
 * (upload flow) OR a real purchase UUID (Gmail deep-link / proactive
 * notification); the loader tries sessionStorage first, then falls back
 * to fetching the purchase by id.
 */

import type { UploadReceiptResponse } from "@/lib/api/purchases";

const STAGING_PREFIX = "claimit:confirm-draft:";
const TRACKED_PREFIX = "claimit:confirm-tracked:";

export type ConfirmDraft = UploadReceiptResponse;

/** A draft plus the staging key it's stored under — passed to the confirm UI. */
export type ConfirmDraftContext = ConfirmDraft & { stagingKey: string };

/**
 * Persist an upload draft and return its staging key (`upload-<uuid>`), or
 * `null` when sessionStorage is unavailable (private mode / quota / disabled).
 * Returning null lets the caller surface a clear error instead of navigating
 * to `/confirm/<key>` that would immediately dead-end on "session expired".
 */
export function stashUploadDraft(draft: ConfirmDraft): string | null {
  const key = `upload-${crypto.randomUUID()}`;
  try {
    sessionStorage.setItem(STAGING_PREFIX + key, JSON.stringify(draft));
  } catch {
    return null;
  }
  return key;
}

/** Read a previously-stashed upload draft, or null if absent / malformed. */
export function readUploadDraft(key: string): ConfirmDraft | null {
  try {
    const raw = sessionStorage.getItem(STAGING_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as ConfirmDraft;
  } catch {
    return null;
  }
}

/** Drop a stashed draft once it has been confirmed or abandoned. */
export function clearUploadDraft(key: string): void {
  try {
    sessionStorage.removeItem(STAGING_PREFIX + key);
  } catch {
    // No-op: nothing actionable if removal fails.
  }
}

/**
 * Multi-item receipts: the user confirms one line at a time, returning to
 * the selection list between each. We remember which `receipt_line_key`s
 * have already been tracked (persisted in sessionStorage so the round-trip
 * to /purchases/:id and back survives) to badge them on the list. Keyed by
 * the same staging key as the draft.
 */
export function readTrackedLineKeys(stagingKey: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(TRACKED_PREFIX + stagingKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/** Mark one receipt line as tracked. No-op if sessionStorage is unavailable. */
export function markLineTracked(stagingKey: string, lineKey: string): void {
  try {
    const keys = readTrackedLineKeys(stagingKey);
    keys.add(lineKey);
    sessionStorage.setItem(TRACKED_PREFIX + stagingKey, JSON.stringify([...keys]));
  } catch {
    // No-op: badging is best-effort.
  }
}

/** Drop the tracked-line record (alongside clearing the draft). */
export function clearTrackedLineKeys(stagingKey: string): void {
  try {
    sessionStorage.removeItem(TRACKED_PREFIX + stagingKey);
  } catch {
    // No-op.
  }
}

/**
 * Project a multi-item draft down to a single chosen line so the existing
 * single-item confirm form can render it. The reshaped line (from
 * `/internal/extract`) is already a full extraction — shared receipt
 * fields merged with the line's own — so we just swap it in as the
 * draft's `extraction`.
 */
export function draftForLine(draft: ConfirmDraft, lineKey: string): ConfirmDraft | null {
  const line = draft.extraction?.line_items?.find((l) => l.receipt_line_key === lineKey);
  if (!line) return null;
  // `UploadLineItem` is already a full single-item extraction (shared
  // fields merged, no nested `line_items`), so swap it straight in.
  return { ...draft, extraction: line };
}

/**
 * A staging key is the upload-flow shape (`upload-<uuid>`); anything else
 * (a bare UUID) is a real purchase id the loader should fetch instead.
 */
export function isStagingKey(key: string): boolean {
  return key.startsWith("upload-");
}
