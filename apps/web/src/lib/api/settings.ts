/**
 * Thin client for /api/v1/settings/* endpoints.
 *
 * Both endpoints are PUTs that fully replace the corresponding User
 * sub-document (User.send_preference / User.notification_prefs) — they do
 * NOT support partial sub-field updates. The frontend must send the entire
 * sub-document on every save (see apps/api-gateway/src/routes/settings.py
 * for the rationale).
 *
 * Mirrors lib/api/auth.ts for ID token plumbing, AbortController timeout,
 * and the {error: {code, message}} envelope shape.
 */

import type { NotificationEventType, SendMode, User } from "@claimit/mongodb-types";
import { auth } from "@/lib/firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Same 10s budget as /auth/me — Cloud Run cold-start tolerance vs UX.
const SETTINGS_TIMEOUT_MS = 10000;

export type UpdateSendPreferenceRequest = {
  default_mode: SendMode;
  auto_send_delay_seconds: number;
};

export type UpdateNotificationsRequest = {
  web_push: boolean;
  email: boolean;
  muted_event_types: NotificationEventType[];
};

export class SettingsApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SettingsApiError";
  }
}

async function _put(path: string, body: unknown): Promise<User> {
  if (!API_BASE_URL) {
    throw new SettingsApiError(
      "missing_api_base_url",
      "NEXT_PUBLIC_API_BASE_URL is not configured.",
    );
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new SettingsApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SETTINGS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new SettingsApiError(
        "request_timeout",
        "Timed out saving your settings. Please try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    let message = `Settings update failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body; keep defaults.
    }
    throw new SettingsApiError(code, message);
  }

  const payload = (await response.json()) as { user: User };
  return payload.user;
}

export async function updateSendPreference(req: UpdateSendPreferenceRequest): Promise<User> {
  return _put("/api/v1/settings/send-preference", req);
}

export async function updateNotifications(req: UpdateNotificationsRequest): Promise<User> {
  return _put("/api/v1/settings/notifications", req);
}
