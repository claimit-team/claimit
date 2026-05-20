/**
 * Thin client for /api/v1/conversations/* endpoints (ticket 5.10).
 *
 * Mirrors lib/api/notifications.ts:
 * - Pulls a fresh Firebase ID token at call time.
 * - AbortController timeout protects against UI hangs.
 * - Translates the backend `{error: {code, message}}` envelope into a
 *   typed ConversationsApiError.
 *
 * The SSE streaming send-message endpoint is NOT in this file — it lives
 * in hooks/useAssistantStream.ts because it needs ReadableStream parsing
 * and AbortSignal lifecycle management tied to the React component tree.
 */

import { auth } from "@/lib/firebase";
import type { Conversation, ConversationMode } from "@/types/assistant";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const CONVERSATIONS_TIMEOUT_MS = 10000;

// The backend types claim_id as `UUID | None`. Pydantic returns a 422
// before our handler runs if the value isn't UUID-shaped. Validate
// client-side so we surface a clear typed error instead of a generic 422
// — this is how mock-data claim_ids like "claim_001" used to silently fail.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListConversationsParams = {
  mode?: ConversationMode;
  status?: "active" | "archived";
  limit?: number;
  cursor?: string;
};

export type ListConversationsResponse = {
  conversations: Conversation[];
  next_cursor: string | null;
};

export type CreateConversationParams = {
  mode: ConversationMode;
  claim_id?: string;
};

export class ConversationsApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConversationsApiError";
  }
}

async function _request<T>(path: string, init: RequestInit, failureMessage: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new ConversationsApiError(
      "missing_api_base_url",
      "NEXT_PUBLIC_API_BASE_URL is not configured.",
    );
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ConversationsApiError("unauthenticated", "User must be signed in.");
  }
  const token = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONVERSATIONS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ConversationsApiError(
        "request_timeout",
        "Timed out loading conversations. Please try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    let message = `${failureMessage} (${response.status})`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body; keep defaults.
    }
    throw new ConversationsApiError(code, message);
  }

  return (await response.json()) as T;
}

export async function listConversations(
  params: ListConversationsParams = {},
): Promise<ListConversationsResponse> {
  const query = new URLSearchParams();
  if (params.mode !== undefined) query.set("mode", params.mode);
  if (params.status !== undefined) query.set("conv_status", params.status);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor !== undefined) query.set("cursor", params.cursor);

  const qs = query.toString();
  const path = `/api/v1/conversations${qs ? `?${qs}` : ""}`;
  // The backend returns { conversations: [...], count: N }. We translate
  // `count`-tail pagination into the cursor-shaped envelope the rest of
  // the frontend uses; once the backend grows cursor support this becomes
  // a no-op rather than a contract break.
  const raw = await _request<{ conversations: Conversation[]; count: number }>(
    path,
    { method: "GET" },
    "Conversations list failed",
  );
  return {
    conversations: raw.conversations,
    next_cursor: null,
  };
}

export async function createConversation(params: CreateConversationParams): Promise<Conversation> {
  const body: Record<string, unknown> = { mode: params.mode };
  if (params.claim_id !== undefined) {
    if (!UUID_REGEX.test(params.claim_id)) {
      // Short-circuit the network call. The backend would return 422
      // anyway (Pydantic UUID parse failure); raising a typed error here
      // lets the calling component render a useful message instead of a
      // generic HTTP 422 status.
      throw new ConversationsApiError(
        "invalid_claim_id",
        `claim_id must be a UUID; received ${JSON.stringify(params.claim_id)}.`,
      );
    }
    body.claim_id = params.claim_id;
  }
  const raw = await _request<{ conversation: Conversation }>(
    "/api/v1/conversations",
    { method: "POST", body: JSON.stringify(body) },
    "Conversation create failed",
  );
  return raw.conversation;
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  // GET /:id is not currently implemented server-side; until it is, we
  // hydrate from the list endpoint and locate the row by id. Cheap for
  // hackathon scale (≤50 conversations per user) and lets the UI render
  // a full message thread without waiting for the server route.
  const page = await listConversations({ limit: 50 });
  const found = page.conversations.find((c) => c.id === conversationId);
  if (!found) {
    throw new ConversationsApiError(
      "conversation_not_found",
      `Conversation ${conversationId} was not found.`,
    );
  }
  return found;
}

/**
 * Acknowledge a proactive notification when the user dismisses the
 * floating card. Thin wrapper over POST /api/v1/notifications/:id/ack —
 * intentionally exported from this module so the assistant feature
 * surface is self-contained at the call site.
 */
export async function acknowledgeProactiveEvent(notificationId: string): Promise<void> {
  await _request<{ notification: unknown }>(
    `/api/v1/notifications/${encodeURIComponent(notificationId)}/ack`,
    { method: "POST" },
    "Acknowledge proactive event failed",
  );
}
