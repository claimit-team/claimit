/**
 * /confirm/[purchaseId] — review extracted purchase details (ticket
 * 5.14 B3).
 *
 * The actual fetch + stale-guard + analyzing-poll all run inside
 * `ConfirmPurchaseLoader` because the api-gateway client reads its
 * auth token from the Firebase client SDK (browser-only state). The
 * page itself is the thinnest possible shell: extract the route
 * param and hand it to the loader.
 *
 * Authenticated deep-link landing (e.g. from the
 * `low_confidence_extract` proactive notification or a future email
 * link) is supported by the authenticated layout's existing
 * redirect-to-login middleware — no `?next=` plumbing is required
 * here for the in-scope 5.14 work.
 */

import { Suspense } from "react";

import { ConfirmPurchaseLoader } from "@/components/confirm/confirm-purchase-loader";

type ConfirmPageProps = {
  params: Promise<{ purchaseId: string }>;
};

export default async function ConfirmPurchasePage({ params }: ConfirmPageProps) {
  const { purchaseId } = await params;
  // Suspense boundary: the loader reads `?line=` via `useSearchParams()`
  // (it needs to react to query-only navigation between the multi-item
  // selection list and a per-line confirm). Wrapping here satisfies the
  // App Router requirement and prevents the static-prerender bailout.
  return (
    <Suspense fallback={null}>
      <ConfirmPurchaseLoader purchaseId={purchaseId} />
    </Suspense>
  );
}
