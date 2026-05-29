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

export type ConfirmDraft = UploadReceiptResponse;

/** A draft plus the staging key it's stored under — passed to the confirm UI. */
export type ConfirmDraftContext = ConfirmDraft & { stagingKey: string };

/** Persist an upload draft and return its staging key (`upload-<uuid>`). */
export function stashUploadDraft(draft: ConfirmDraft): string {
  const key = `upload-${crypto.randomUUID()}`;
  try {
    sessionStorage.setItem(STAGING_PREFIX + key, JSON.stringify(draft));
  } catch {
    // Private-mode / quota errors: the loader's UUID fallback handles a
    // missing draft gracefully, so swallow rather than block the upload.
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
 * A staging key is the upload-flow shape (`upload-<uuid>`); anything else
 * (a bare UUID) is a real purchase id the loader should fetch instead.
 */
export function isStagingKey(key: string): boolean {
  return key.startsWith("upload-");
}
