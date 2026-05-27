"use client";

import type { Platform } from "@claimit/mongodb-types";
import { useEffect, useState } from "react";

import { getPolicyWindow, type PolicyWindowResponse } from "@/lib/api/policies";

/**
 * Reactive policy lookup for the confirm-page out-of-window banner
 * (BUG-59).
 *
 * Returns `{policy: null, loading: false}` immediately when no platform
 * is selected (empty string in the form's `ConfirmFormState`). For a
 * real platform value, the hook fetches the policy and exposes a
 * `loading` flag callers use to suppress the banner mid-flight (avoids
 * flicker on platform edits).
 *
 * A module-level cache de-dupes fetches across remounts and across
 * platform flips: re-selecting a previously-fetched platform resolves
 * synchronously from cache. Errors are treated as "no policy" — the
 * caller's `computeWindowDays` falls back to the 15-day default, which
 * matches the backend's `policy is None` semantics.
 */
const cache = new Map<string, Promise<PolicyWindowResponse | null>>();

export function usePlatformPolicy(platform: Platform | ""): {
  policy: PolicyWindowResponse | null;
  loading: boolean;
} {
  const [policy, setPolicy] = useState<PolicyWindowResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (platform === "") {
      setPolicy(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let promise = cache.get(platform);
    if (promise === undefined) {
      promise = getPolicyWindow(platform).catch((err) => {
        // Swallow: error path is identical to "no policy" downstream.
        console.warn(`[usePlatformPolicy] policy fetch failed for ${platform}:`, err);
        return null;
      });
      cache.set(platform, promise);
    }
    setLoading(true);
    setPolicy(null);
    promise.then((result) => {
      if (cancelled) return;
      setPolicy(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  return { policy, loading };
}
