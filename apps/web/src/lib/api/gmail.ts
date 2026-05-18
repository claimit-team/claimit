/**
 * Thin client for /api/v1/gmail/* endpoints.
 *
 * Pulls the Firebase ID token from the current auth.currentUser at call time
 * (rather than reading from Zustand) so we always send a fresh token — Firebase
 * auto-refreshes hourly, and using the SDK's getIdToken() respects that.
 */

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

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

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
