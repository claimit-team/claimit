/**
 * Thin client for /api/v1/policies/{platform}.
 *
 * Mirrors lib/api/purchases.ts: Firebase ID-token attached at call time,
 * AbortController timeout, structured `{error: {code, message}}`
 * envelope translation.
 *
 * 404 is converted to `null` instead of throwing — semantically
 * identical to the backend's "policy is None" branch in
 * `confirm_purchase`, so the consuming UI can fall through to the
 * 15-day default without distinguishing "no policy" from a real error.
 */

import type { Platform } from "@claimit/mongodb-types";

import { friendlyMessage } from "@/lib/api/errors";
import { auth } from "@/lib/firebase";
import type { PolicyWindowDoc } from "@/lib/policy-window";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const POLICIES_TIMEOUT_MS = 10000;

export class PoliciesApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PoliciesApiError";
  }
}

export type PolicyWindowResponse = PolicyWindowDoc & {
  claim_type: string;
};

export async function getPolicyWindow(
  platform: Platform | string,
): Promise<PolicyWindowResponse | null> {
  if (!API_BASE_URL) {
    throw new PoliciesApiError(
      "missing_api_base_url",
      "NEXT_PUBLIC_API_BASE_URL is not configured.",
    );
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new PoliciesApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), POLICIES_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/policies/${encodeURIComponent(platform)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new PoliciesApiError("request_timeout", "Timed out loading policy.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    let code = "request_failed";
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
    } catch {
      // non-JSON body — keep default code
    }
    throw new PoliciesApiError(code, friendlyMessage(response.status, code));
  }
  return (await response.json()) as PolicyWindowResponse;
}
