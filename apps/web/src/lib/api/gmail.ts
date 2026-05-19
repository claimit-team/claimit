/**
 * Thin client for /api/v1/gmail/* endpoints.
 *
 * Pulls the Firebase ID token from the current auth.currentUser at call time
 * (rather than reading from Zustand) so we always send a fresh token — Firebase
 * auto-refreshes hourly, and using the SDK's getIdToken() respects that.
 */

import type { User } from "@claimit/mongodb-types";
import { auth } from "@/lib/firebase";

export type ConnectGmailResponse = { authorization_url: string };

/**
 * User-facing labels for /api/v1/gmail/callback ?status=error&reason=<x> redirects.
 * Shared by the settings and onboarding pages that handle the post-OAuth toast.
 */
export const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  state_expired: "Your Gmail connection request expired. Please try again.",
  state_invalid: "Gmail connection security check failed. Please try again.",
  code_exchange_failed: "Google could not complete the Gmail connection. Please try again.",
  internal_error: "Something went wrong connecting Gmail. Please try again.",
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Same 10s budget as /auth/me — Cloud Run cold-start tolerance vs UX
// (users perceive >5s as broken). Without this, a hung TCP connection
// would freeze the connect/disconnect button indefinitely with no
// recovery path.
const GMAIL_TIMEOUT_MS = 10000;

export class GmailApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

export async function connectGmail(returnTo: string): Promise<ConnectGmailResponse> {
  if (!API_BASE_URL) {
    throw new GmailApiError("missing_api_base_url", "NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  const user = auth.currentUser;
  if (!user) {
    throw new GmailApiError("unauthenticated", "User must be signed in.");
  }

  const token = await user.getIdToken();
  const url = new URL(`${API_BASE_URL}/api/v1/gmail/connect`);
  url.searchParams.set("return_to", returnTo);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GMAIL_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new GmailApiError("request_timeout", "Timed out reaching Gmail. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // Backend uses the {error: {code, message}} envelope from middleware/errors.py.
    let code = "request_failed";
    let message = `Gmail connect failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body; keep defaults.
    }
    throw new GmailApiError(code, message);
  }

  return (await response.json()) as ConnectGmailResponse;
}

export async function disconnectGmail(): Promise<User> {
  if (!API_BASE_URL) {
    throw new GmailApiError("missing_api_base_url", "NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  const user = auth.currentUser;
  if (!user) {
    throw new GmailApiError("unauthenticated", "User must be signed in.");
  }

  const token = await user.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GMAIL_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/gmail/disconnect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new GmailApiError("request_timeout", "Timed out reaching Gmail. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    let message = `Gmail disconnect failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body; keep defaults.
    }
    throw new GmailApiError(code, message);
  }

  const body = (await response.json()) as { user: User };
  return body.user;
}
