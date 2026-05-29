"use client";

import {
  ArrowRight,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Receipt,
  TrendingDown,
  ZoomIn,
} from "lucide-react";
import Link from "next/link";
import { type ElementType, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ClaimsApiError, fetchEvidenceBlob } from "@/lib/api/claims";
import { formatClaimCurrency } from "@/lib/claim-detail";
import type { ClaimDetail } from "@/lib/claim-detail-types";
import { toSafeExternalHref } from "@/lib/safe-url";

interface EvidencePaneProps {
  claim: ClaimDetail;
  onDoubleClickHeader?: () => void;
}

function PaneHeader({
  title,
  icon: Icon,
  onDoubleClick,
}: {
  title: string;
  icon: ElementType;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      type="button"
      title="Double-click to maximize"
      className="group flex w-full cursor-pointer items-center gap-2 border-neutral-200 border-b bg-neutral-0 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
      onDoubleClick={onDoubleClick}
    >
      <Icon className="h-4 w-4 text-neutral-500" />
      <h3 className="font-medium text-neutral-900 text-sm">{title}</h3>
      <Maximize2 className="ml-auto h-3.5 w-3.5 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

// Read-tolerant formatters: with real (sometimes-null) view-model data
// the input can be `""` (no `updated_at`/`purchase_date` on the wire
// doc) or a malformed ISO string. `new Date("")` produces an "Invalid
// Date" with NaN timestamp — formatting that would render literally
// "Invalid Date" in the UI. Guarding here keeps the rest of the pane
// crash-free without per-call-site null checks.
//
// `formatEvidenceDate` returns `null` (caller hides the Clock pill);
// `formatDateShort` returns `"—"` (caller shows the dash in place of
// a date).
function formatEvidenceDate(dateString: string): string | null {
  if (dateString === "") return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateShort(dateString: string): string {
  if (dateString === "") return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Real price-drop screenshot loaded through the api-gateway evidence
 * proxy (ticket 5.8 / WI-2). Mirrors the load+zoom shape of
 * `components/confirm/receipt-preview.tsx`: blob → object URL → click
 * to open a centered Dialog with the full-size image.
 *
 * The evidence bucket has `public_access_prevention=enforced`, so we
 * always go through `GET /api/v1/claims/:id/evidence` rather than a
 * signed URL (matches the receipt-proxy decision).
 *
 * States:
 *   - `loading`  → skeleton.
 *   - `missing`  → calm "No evidence captured yet" — fired when the
 *     proxy returns null (no `evidence_screenshot_url`, blob gone,
 *     bucket mismatch — every "no evidence" wire shape collapses into
 *     a single 404, never 403, see services.claims_service).
 *   - `error`    → compact retry surface.
 *   - `ready`    → image + click-to-zoom Dialog.
 *
 * Object URLs are revoked on unmount AND on every retry (the cleanup
 * runs before the next effect body) to avoid leaking the in-memory
 * bitmap — same hygiene as receipt-preview's blob handling.
 */
type EvidenceLoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; url: string };

/**
 * Source line under the evidence screenshot. Renders `Source: <platform>`
 * as a plain label when `sourceUrl` is missing or non-http(s); otherwise
 * makes the platform name a sanitized external link to the live product
 * page so the user can verify the snapshot against current pricing.
 * Sanitization via `toSafeExternalHref` mirrors the post-approve banner
 * + draft pane callsites (PR #168 R6 — never inject `javascript:` or
 * relative URLs into anchor hrefs).
 */
function SourceLine({ platform, sourceUrl }: { platform: string; sourceUrl: string | undefined }) {
  const safeHref = toSafeExternalHref(sourceUrl);
  if (!safeHref) {
    return <span>Source: {platform}</span>;
  }
  return (
    <span>
      Source:{" "}
      <a
        href={safeHref}
        target="_blank"
        rel="noreferrer noopener"
        className="text-brand-primary-500 hover:underline"
      >
        {platform}
      </a>
    </span>
  );
}

function EvidenceScreenshot({ claimId, platform }: { claimId: string; platform: string }) {
  const [state, setState] = useState<EvidenceLoadState>({ kind: "loading" });
  const [zoomOpen, setZoomOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const altText = `${platform} price-drop screenshot`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reloadTick` is the manual refetch trigger; it isn't read inside the effect body but its state change must re-run the fetch.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setState({ kind: "loading" });

    fetchEvidenceBlob(claimId)
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          setState({ kind: "missing" });
          return;
        }
        createdUrl = URL.createObjectURL(result.blob);
        setState({ kind: "ready", url: createdUrl });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ClaimsApiError ? err.message : "We couldn't load the price screenshot.";
        setState({ kind: "error", message });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [claimId, reloadTick]);

  if (state.kind === "loading") {
    return (
      <div className="space-y-2">
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
        <div className="text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
          <span className="mt-1 text-neutral-400 text-xs">No evidence captured yet</span>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-center">
        <p className="text-neutral-600 text-xs">{state.message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setReloadTick((t) => t + 1)}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomOpen(true)}
        className="group relative w-full cursor-zoom-in overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 text-left"
      >
        {/* biome-ignore lint/performance/noImgElement: Object-URL preview backed by the api-gateway proxy fetch; next/image would force a remote loader on a blob: URL. */}
        <img src={state.url} alt={altText} className="block h-32 w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-950/0 transition-colors group-hover:bg-neutral-950/10">
          <div className="rounded-full bg-neutral-0/90 p-2 opacity-0 shadow transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-4 w-4 text-neutral-700" aria-hidden />
          </div>
        </div>
      </button>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-3xl" showCloseButton>
          <DialogTitle className="sr-only">{altText}</DialogTitle>
          <div className="flex max-h-[80vh] items-center justify-center overflow-auto p-4">
            {/* biome-ignore lint/performance/noImgElement: Object-URL preview backed by the api-gateway proxy fetch. */}
            <img src={state.url} alt={altText} className="h-auto w-full" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * "Read full policy" external link. Replaces the old static
 * in-app Dialog (ticket 5.8 / WI-4) — the merchant's policy text
 * evolves out-of-band, so the source-of-truth surface is the merchant's
 * own page, not a frozen Eligibility-requirements bullet list we ship.
 *
 * `policy_url` is sanitized via `toSafeExternalHref` so a malformed,
 * relative, or non-http(s) wire value yields no link rather than
 * injecting `javascript:` into the anchor. When no safe link, the
 * link is hidden entirely (preferable to a dead button).
 */
function PolicyExternalLink({
  platform,
  policyUrl,
}: {
  platform: string;
  policyUrl: string | undefined;
}) {
  const safeHref = toSafeExternalHref(policyUrl);
  if (!safeHref) return null;
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 font-medium text-brand-primary-500 text-sm hover:underline"
    >
      Read {platform} policy
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

export function EvidencePane({ claim, onDoubleClickHeader }: EvidencePaneProps) {
  const { evidence, purchase } = claim;
  const priceDifference = evidence.original_price - evidence.current_price;
  // Lifted out of the JSX (was an IIFE) — purely a readability nit per
  // CodeRabbit. Behavior identical: `null` means "no valid date";
  // caller short-circuits the Clock pill.
  const capturedDate = formatEvidenceDate(evidence.captured_at);

  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader title="Evidence" icon={FileText} onDoubleClick={onDoubleClickHeader} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <TrendingDown className="h-4 w-4 text-semantic-warning" />
                Current price
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline justify-between">
                <div className="space-y-1">
                  <div className="text-neutral-500 text-sm tabular-nums">
                    Original: {formatClaimCurrency(evidence.original_price, claim.currency)}
                  </div>
                  <div className="font-semibold text-2xl text-neutral-900 tabular-nums">
                    {formatClaimCurrency(evidence.current_price, claim.currency)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-lg text-semantic-warning tabular-nums">
                    -{formatClaimCurrency(priceDifference, claim.currency)}
                  </div>
                  <div className="text-neutral-500 text-xs">difference</div>
                </div>
              </div>

              <EvidenceScreenshot claimId={claim.claim_id} platform={claim.platform} />

              <div className="flex items-center justify-between text-neutral-500 text-xs">
                <SourceLine platform={claim.platform} sourceUrl={evidence.source_url} />
                {capturedDate !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {capturedDate}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <FileText className="h-4 w-4" />
                {claim.platform} price match policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Highlighted cited clause — visual highlight via the
                  --semantic-warning-bg token (light amber). True ES-snippet
                  per-token highlighting would need backend support and a
                  matching wire field; deferred. */}
              <blockquote className="rounded-r-md border-semantic-warning border-l-4 bg-semantic-warning-bg/30 px-3 py-2 text-neutral-700 text-sm italic">
                {evidence.policy_clause}
              </blockquote>

              <PolicyExternalLink platform={claim.platform} policyUrl={claim.policy?.policy_url} />

              {claim.policy?.last_verified ? (
                <p className="text-neutral-500 text-xs">
                  Policy verified {formatDateShort(claim.policy.last_verified)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <Receipt className="h-4 w-4" />
                Your original purchase
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
                <div className="text-center">
                  <Receipt className="mx-auto h-6 w-6 text-neutral-400" />
                  <span className="mt-1 text-neutral-400 text-xs">Receipt</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Purchase date</span>
                  <span className="text-neutral-900">
                    {formatDateShort(purchase.purchase_date)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Order ID</span>
                  <span className="font-mono text-neutral-900">{purchase.order_id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Price paid</span>
                  <span className="font-medium text-neutral-900">
                    {formatClaimCurrency(purchase.price_paid, claim.currency)}
                  </span>
                </div>
              </div>

              <Link
                href={`/purchases/${purchase.purchase_id}`}
                className="inline-flex items-center gap-1 font-medium text-brand-primary-500 text-sm hover:underline"
              >
                View purchase
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
