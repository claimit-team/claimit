"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";

/**
 * Whitelisted same-origin paths the `?from=` query is allowed to
 * dictate as the Back target. Anything outside this list (absolute
 * URLs, protocol-relative `//evil.com`, `javascript:`, missing leading
 * `/`, double-slash prefixes, …) falls back to `/dashboard` — which is
 * also the Cancel target, so the implicit contract stays "Back exits
 * to where Cancel would exit unless the caller passed a known interior
 * path".
 *
 * Allow-list rather than block-list so the open-redirect surface is
 * naturally bounded: the only thing a future call-site can do via
 * `?from=` is pick from these known interior surfaces.
 */
const FROM_EXACT_ALLOWLIST = new Set<string>(["/dashboard", "/", "/purchases", "/upload"]);
const FROM_PREFIX_ALLOWLIST = ["/purchases/", "/purchases?"];

/**
 * Resolve the Back destination from a raw `?from=` value.
 *
 * Exported for unit testing — the resolution logic is the load-bearing
 * security boundary (open-redirect prevention), so it gets a direct
 * test without needing to mount the component.
 */
export function resolveBackHref(raw: string | null | undefined): string {
  if (!raw) return "/dashboard";
  // Must start with a single `/` and not `//` (which would be parsed
  // as a protocol-relative URL by router.push on some browsers).
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (FROM_EXACT_ALLOWLIST.has(raw)) return raw;
  for (const prefix of FROM_PREFIX_ALLOWLIST) {
    if (raw.startsWith(prefix)) return raw;
  }
  return "/dashboard";
}

/**
 * Top-left "Back" affordance for the `/confirm/:id` page.
 *
 * Origin-aware via a whitelisted `?from=` query parameter, with
 * `/dashboard` (the Cancel target) as the safe fallback. Cancel in
 * `action-bar.tsx` intentionally stays hardcoded — the directive is
 * "keep Cancel as-is"; Back is the new affordance that respects the
 * caller's `?from=` hint when present.
 *
 * Implementation notes:
 *
 * - Reads `window.location.search` inside the click handler rather
 *   than going through `useSearchParams()`. The repo precedent for
 *   avoiding the App Router static-prerender Suspense bailout is to
 *   read `window.location.search` lazily (see
 *   `apps/web/src/app/(onboarding)/onboarding/gmail/page.tsx` L30-31);
 *   doing the same here keeps the confirm page out of the bailout.
 *
 * - Computing the destination on click (not at render) also means
 *   no SSR/CSR text mismatch and no flash if the param changes mid-
 *   session (e.g. router.push to the same page with a new `?from=`).
 *
 * - Open-redirect defence lives in `resolveBackHref`, which is the
 *   only path the `?from=` value reaches `router.push` through.
 */
export function ConfirmPageHeader() {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (typeof window === "undefined") {
      router.push("/dashboard");
      return;
    }
    const from = new URLSearchParams(window.location.search).get("from");
    router.push(resolveBackHref(from));
  }, [router]);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Back"
        onClick={handleBack}
        className="size-8 shrink-0"
      >
        <ArrowLeft className="size-4" />
      </Button>
    </div>
  );
}
