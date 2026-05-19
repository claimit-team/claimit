/**
 * Thin client for /api/v1/dashboard/* endpoints.
 *
 * Mirrors lib/api/auth.ts: pulls the Firebase ID token from
 * auth.currentUser at call time so every request carries a fresh token
 * (Firebase auto-refreshes hourly via getIdToken()), and translates the
 * backend `{error: {code, message}}` envelope into a typed
 * DashboardApiError.
 */

import { auth } from "@/lib/firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Same 10s budget as /auth/me — balances Cloud Run cold-start tolerance
// (3-5s in practice) against UX (users perceive >5s as broken).
const DASHBOARD_TIMEOUT_MS = 10000;

/**
 * RecentResolvedClaim and DashboardSummary describe the
 * GET /api/v1/dashboard/summary response shape. They are derived
 * (aggregated/projected) wire shapes, not MongoDB document types, so
 * they belong here next to the client rather than in
 * packages/shared/mongodb. If a future ticket needs to share these
 * across the codebase, extract to a new packages/shared/api/.
 */
export type RecentResolvedClaim = {
  claim_id: string;
  platform: string;
  outcome: string;
  amount: number;
};

export type DashboardSummary = {
  total_savings_month: number;
  total_savings_lifetime: number;
  active_claims_count: number;
  monitoring_purchases_count: number;
  recent_resolved: RecentResolvedClaim[];
};

export class DashboardApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DashboardApiError";
  }
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (!API_BASE_URL) {
    throw new DashboardApiError(
      "missing_api_base_url",
      "NEXT_PUBLIC_API_BASE_URL is not configured.",
    );
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new DashboardApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DASHBOARD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/dashboard/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new DashboardApiError(
        "request_timeout",
        "Timed out loading dashboard. Please try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "request_failed";
    let message = `Dashboard summary failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body; keep defaults.
    }
    throw new DashboardApiError(code, message);
  }

  return (await response.json()) as DashboardSummary;
}
