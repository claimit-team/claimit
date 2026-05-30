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
import { friendlyMessage } from "@/lib/api/errors";
import { auth } from "@/lib/firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function logAuthEvent(event: string, attemptId: string, data?: Record<string, unknown>) {
  console.info("[auth.signin]", { event, attemptId, ts: Date.now(), ...data });
}

// Staged budget: 5s token + 10s fetch = 15s upper bound.
// Post-mitigation (Cloud Run min-instances=1), p99 fetch is ~50ms; this
// ceiling exists for DEPLOYMENT_ROLLOUT cold-start windows.
const TOKEN_TIMEOUT_MS = 5000;
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
  const overallStart = Date.now();
  const attemptId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `attempt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  if (!API_BASE_URL) {
    throw new AuthApiError("missing_api_base_url", "NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new AuthApiError("unauthenticated", "User must be signed in.");
  }

  const tokenStart = Date.now();
  logAuthEvent("getIdToken.start", attemptId);
  let token: string;
  try {
    token = await Promise.race([
      currentUser.getIdToken(),
      new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(
            new AuthApiError(
              "token_timeout",
              "Sign-in is taking longer than expected. Please try again.",
            ),
          );
        }, TOKEN_TIMEOUT_MS);
      }),
    ]);
    logAuthEvent("getIdToken.end", attemptId, { durationMs: Date.now() - tokenStart });
  } catch (err) {
    logAuthEvent("getIdToken.error", attemptId, {
      durationMs: Date.now() - tokenStart,
      error: String(err),
    });
    throw err;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_ME_TIMEOUT_MS);

  const fetchStart = Date.now();
  logAuthEvent("fetch.start", attemptId);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    logAuthEvent("fetch.end", attemptId, {
      durationMs: Date.now() - fetchStart,
      status: response.status,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      logAuthEvent("fetch.timeout", attemptId, { durationMs: Date.now() - fetchStart });
      throw new AuthApiError(
        "request_timeout",
        "Timed out loading your profile. Please try again.",
      );
    }
    logAuthEvent("fetch.error", attemptId, {
      durationMs: Date.now() - fetchStart,
      error: String(err),
    });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
    } catch {
      // Non-JSON body; keep defaults.
    }
    const message = friendlyMessage(response.status, code);
    throw new AuthApiError(code, message);
  }

  const body = (await response.json()) as { user: User };
  logAuthEvent("overall.success", attemptId, { totalMs: Date.now() - overallStart });
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
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
    } catch {
      // Non-JSON body; keep defaults.
    }
    const message = friendlyMessage(response.status, code);
    throw new AuthApiError(code, message);
  }

  const body = (await response.json()) as { user: User };
  return body.user;
}

export type UserResponse = {
  user: User;
};

async function authMultipartRequest(path: string, file: File): Promise<User> {
  if (!API_BASE_URL) {
    throw new AuthApiError("missing_api_base_url", "NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new AuthApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();
  const form = new FormData();
  form.append("file", file, file.name);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_ME_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AuthApiError(
        "request_timeout",
        "Timed out uploading your photo. Please try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
    } catch {
      // Non-JSON body; keep defaults.
    }
    const message = friendlyMessage(response.status, code);
    throw new AuthApiError(code, message);
  }

  const body = (await response.json()) as UserResponse;
  return body.user;
}

async function authDeleteRequest(path: string): Promise<User> {
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
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AuthApiError("request_timeout", "Timed out removing your photo. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
    } catch {
      // Non-JSON body; keep defaults.
    }
    const message = friendlyMessage(response.status, code);
    throw new AuthApiError(code, message);
  }

  const body = (await response.json()) as UserResponse;
  return body.user;
}

export async function uploadAvatar(file: File): Promise<UserResponse> {
  const user = await authMultipartRequest("/api/v1/auth/me/avatar", file);
  return { user };
}

export async function deleteAvatar(): Promise<UserResponse> {
  const user = await authDeleteRequest("/api/v1/auth/me/avatar");
  return { user };
}
