/**
 * Thin client for /api/v1/auth/* endpoints.
 *
 * Pulls the Firebase ID token from the current auth.currentUser at call time
 * (rather than reading from Zustand) so we always send a fresh token — Firebase
 * auto-refreshes hourly, and using the SDK's getIdToken() respects that.
 */

import type {
  DefaultLocation,
  IngestionSkiplistEntry,
  LoyaltyMembership,
  User,
} from "@claimit/mongodb-types";
import { auth } from "@/lib/firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// 10s balances Cloud Run cold-start tolerance (3-5s in practice) against UX
// (users perceive >5s as broken). On hung connections without this timeout
// the auth resolution would stall indefinitely with no recovery path.
const AUTH_ME_TIMEOUT_MS = 10000;

/**
 * Partial-update payload for PATCH /api/v1/auth/me.
 *
 * All fields optional; null/missing fields are treated as "no change" by the
 * backend (model_dump(exclude_none=True)). `email` is intentionally absent —
 * it's owned by Firebase Auth.
 */
export type PatchUserMeRequest = {
  name?: string;
  default_location?: DefaultLocation;
  loyalty_memberships?: LoyaltyMembership[];
  ingestion_skiplist?: IngestionSkiplistEntry[];
  onboarded?: boolean;
};

export class AuthApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

export async function getMe(): Promise<User> {
  if (!API_BASE_URL) {
    throw new AuthApiError("missing_api_base_url", "NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new AuthApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_ME_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AuthApiError(
        "request_timeout",
        "Timed out loading your profile. Please try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    let message = `Auth me failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body; keep defaults.
    }
    throw new AuthApiError(code, message);
  }

  const body = (await response.json()) as { user: User };
  return body.user;
}

export async function patchUserMe(req: PatchUserMeRequest): Promise<User> {
  if (!API_BASE_URL) {
    throw new AuthApiError("missing_api_base_url", "NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new AuthApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_ME_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AuthApiError("request_timeout", "Timed out saving your profile. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    let message = `Profile update failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body; keep defaults.
    }
    throw new AuthApiError(code, message);
  }

  const body = (await response.json()) as { user: User };
  return body.user;
}
