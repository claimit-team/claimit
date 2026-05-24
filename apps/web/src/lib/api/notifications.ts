/**
 * Thin client for /api/v1/notifications/* endpoints.
 *
 * Mirrors lib/api/dashboard.ts and lib/api/settings.ts:
 * - Pulls the Firebase ID token at call time so requests carry a fresh
 *   token (Firebase auto-refreshes hourly via getIdToken()).
 * - AbortController timeout protects against UI hangs.
 * - Translates the backend `{error: {code, message}}` envelope into a
 *   typed NotificationsApiError.
 *
 * The wire shapes returned by the API are inlined here rather than
 * imported from packages/shared/mongodb because they include
 * server-derived pagination state (next_cursor, unread_count) that does
 * not belong on a MongoDB document type.
 */

import type { NotificationEvent, NotificationEventType } from "@claimit/mongodb-types";
import { friendlyMessage } from "@/lib/api/errors";
import { auth } from "@/lib/firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Same 10s budget as the other thin clients — Cloud Run cold-start
// tolerance vs UX. The header bell unread poll uses a separate, shorter
// effective timeout because it issues GETs every 60s.
const NOTIFICATIONS_TIMEOUT_MS = 10000;

export type ListNotificationsParams = {
  event_type?: NotificationEventType;
  acknowledged?: boolean;
  limit?: number;
  cursor?: string;
};

export type ListNotificationsResponse = {
  notifications: NotificationEvent[];
  next_cursor: string | null;
  unread_count: number;
};

export class NotificationsApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotificationsApiError";
  }
}

async function _request<T>(path: string, init: RequestInit, _failureMessage: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new NotificationsApiError(
      "missing_api_base_url",
      "NEXT_PUBLIC_API_BASE_URL is not configured.",
    );
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new NotificationsApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NOTIFICATIONS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new NotificationsApiError(
        "request_timeout",
        "Timed out loading notifications. Please try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
    } catch {
      // Non-JSON body; keep defaults.
    }
    const message = friendlyMessage(response.status, code);
    throw new NotificationsApiError(code, message);
  }

  return (await response.json()) as T;
}

export async function listNotifications(
  params: ListNotificationsParams = {},
): Promise<ListNotificationsResponse> {
  const query = new URLSearchParams();
  if (params.event_type !== undefined) query.set("event_type", params.event_type);
  if (params.acknowledged !== undefined) query.set("acknowledged", String(params.acknowledged));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor !== undefined) query.set("cursor", params.cursor);

  const qs = query.toString();
  const path = `/api/v1/notifications${qs ? `?${qs}` : ""}`;
  return _request<ListNotificationsResponse>(
    path,
    { method: "GET" },
    "Notifications request failed",
  );
}

export async function ackNotification(notificationId: string): Promise<NotificationEvent> {
  const payload = await _request<{ notification: NotificationEvent }>(
    `/api/v1/notifications/${encodeURIComponent(notificationId)}/ack`,
    { method: "POST" },
    "Notification ack failed",
  );
  return payload.notification;
}

export async function ackAllNotifications(): Promise<number> {
  const payload = await _request<{ acknowledged_count: number }>(
    "/api/v1/notifications/ack-all",
    { method: "POST" },
    "Notification mark-all-read failed",
  );
  return payload.acknowledged_count;
}
