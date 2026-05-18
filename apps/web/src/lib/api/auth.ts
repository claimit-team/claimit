/**
 * Thin client for /api/v1/auth/* endpoints.
 *
 * Pulls the Firebase ID token from the current auth.currentUser at call time
 * (rather than reading from Zustand) so we always send a fresh token — Firebase
 * auto-refreshes hourly, and using the SDK's getIdToken() respects that.
 */

import type { User } from "@claimit/mongodb-types";
import { auth } from "@/lib/firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

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

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

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
