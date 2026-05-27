"use client";

import type { ClaimOutcome } from "@claimit/mongodb-types";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ClaimOutcomeBadge } from "@/components/claims/claim-outcome-badge";
import { PlatformLogo } from "@/components/claims/platform-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClaims } from "@/hooks/useClaims";
import type { ClaimListItem, StatusGroup } from "@/lib/api/claims";
import { claimTypeLabel, formatRelativeFromNow, formatWindowRemaining } from "@/lib/claims-status";
import { cn } from "@/lib/utils";

// --- chip group config ---------------------------------------------------

type ChipKey = "all" | StatusGroup;
const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
];

// --- empty-state copy (per v0 prompt §5) ---------------------------------
//
// Fixed copy per filter so the page is never just a blank slate. No money
// totals or aspirational stats — those belong on the dashboard.
const EMPTY_COPY: Record<ChipKey, { title: string; body: string }> = {
  all: {
    title: "No claims yet",
    body: "When ClaimIt drafts a claim from a monitored purchase, it will show up here.",
  },
  pending: {
    title: "Nothing pending",
    body: "Claims waiting for your approval will land here.",
  },
  in_progress: {
    title: "No claims in progress",
    body: "Claims that have been submitted to the merchant and are waiting on a reply.",
  },
  resolved: {
    title: "No resolved claims yet",
    body: "Once a merchant replies — approved, denied, or otherwise — claims show up here.",
  },
};

// --- formatting helpers --------------------------------------------------

// Null-safe so a legacy claim with `claim_amount=null` (read-tolerant
// surface, see PR #142) renders as "—" instead of crashing the page.
function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null || currency === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

// `claim.platform` may be null on legacy data — render the same em-dash
// rather than calling `.replace` on a nullish value.
function platformLabel(platform: string | null): string {
  if (platform === null || platform === "") return "—";
  return platform.replace(/_/g, " ");
}

function formatDateShort(iso: string | null): string {
  if (iso === null) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Compute the "Window/Resolved" cell text for a row, encoding the
 * outcome-driven copy rules from the v0 prompt:
 *
 * - draft_pending -> "11 days remaining" (countdown vs window_expires)
 * - pending       -> "Submitted N days ago" or "Outcome needed" (no submitted_at)
 * - approved/denied/user_self_service/user_cancelled/no_response -> resolved_at
 * - expired       -> "Window expired"
 */
function windowOrResolvedCell(claim: ClaimListItem): string {
  switch (claim.outcome) {
    case "draft_pending":
      return formatWindowRemaining(claim.window_expires);
    case "pending":
      return claim.submitted_at !== null
        ? formatRelativeFromNow(claim.submitted_at)
        : "Outcome needed";
    case "approved":
    case "denied":
    case "user_self_service":
    case "user_cancelled":
    case "no_response":
      return claim.resolved_at !== null
        ? `Resolved ${formatDateShort(claim.resolved_at)}`
        : "Resolved";
    case "expired":
      return "Window expired";
    default:
      // Unknown / null outcome (read-tolerant backend surfaces legacy
      // values verbatim — see PR #142). Fall back to whichever date we
      // have so the row still carries useful info.
      if (claim.resolved_at !== null) return `Resolved ${formatDateShort(claim.resolved_at)}`;
      if (claim.submitted_at !== null) return formatRelativeFromNow(claim.submitted_at);
      return formatWindowRemaining(claim.window_expires);
  }
}

function amountClassName(outcome: ClaimOutcome | string | null | undefined): string {
  // approved -> green semantic. Everything else stays neutral so that
  // unresolved or denied claims never visually masquerade as money won.
  return outcome === "approved" ? "text-brand-accent-500" : "text-neutral-700";
}

// --- skeleton + empty + error states -------------------------------------

// Skeleton placeholder keys — fixed-count, fixed-order, no semantic
// identity beyond "Nth row in the loading state", so a hand-rolled stable
// id list satisfies React's key constraint without an index.
const ROW_SKELETON_KEYS = ["sk-row-1", "sk-row-2", "sk-row-3", "sk-row-4", "sk-row-5"] as const;
const CARD_SKELETON_KEYS = ["sk-card-1", "sk-card-2", "sk-card-3", "sk-card-4"] as const;

function LoadingSkeleton() {
  return (
    <>
      <div className="hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm md:block">
        <div className="space-y-3 p-4">
          {ROW_SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {CARD_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </>
  );
}

function EmptyState({ chip }: { chip: ChipKey }) {
  const copy = EMPTY_COPY[chip];
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="py-10 text-center">
        <h3 className="text-base font-medium text-neutral-900">{copy.title}</h3>
        <p className="mt-2 text-sm text-neutral-600">{copy.body}</p>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert className="mx-auto max-w-xl">
      <AlertTitle>Couldn't load claims</AlertTitle>
      <AlertDescription>
        <p className="mb-3 text-sm">{message}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// --- row renderers -------------------------------------------------------

function ClaimRow({ claim }: { claim: ClaimListItem }) {
  const router = useRouter();
  const href = `/claims/${claim._id}`;
  return (
    <TableRow
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="cursor-pointer"
    >
      <TableCell>
        <ClaimOutcomeBadge outcome={claim.outcome} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <PlatformLogo platform={claim.platform} category={claim.category} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-neutral-900">
              {claim.product_name ?? "Unlinked claim"}
            </span>
            <span className="text-xs text-neutral-500 capitalize">
              {platformLabel(claim.platform)}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm text-neutral-700">{claimTypeLabel(claim.claim_type)}</TableCell>
      <TableCell
        className={cn("text-right font-medium tabular-nums", amountClassName(claim.outcome))}
      >
        {formatMoney(claim.claim_amount, claim.currency)}
      </TableCell>
      <TableCell className="text-sm text-neutral-700">{windowOrResolvedCell(claim)}</TableCell>
      <TableCell className="text-sm text-neutral-500">
        {formatDateShort(claim.submitted_at)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          render={<Link href={href} />}
          size="sm"
          variant="outline"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ClaimCard({ claim }: { claim: ClaimListItem }) {
  const router = useRouter();
  const href = `/claims/${claim._id}`;
  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="cursor-pointer overflow-hidden"
    >
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between">
          <ClaimOutcomeBadge outcome={claim.outcome} />
          <span className={cn("font-medium tabular-nums", amountClassName(claim.outcome))}>
            {formatMoney(claim.claim_amount, claim.currency)}
          </span>
        </div>
        <div className="flex items-start gap-3">
          <PlatformLogo platform={claim.platform} category={claim.category} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-neutral-900">
              {claim.product_name ?? "Unlinked claim"}
            </span>
            <span className="text-xs text-neutral-500 capitalize">
              {platformLabel(claim.platform)} · {claimTypeLabel(claim.claim_type)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          <span>{windowOrResolvedCell(claim)}</span>
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-brand-primary-500 hover:underline"
          >
            View
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// --- main page -----------------------------------------------------------

export default function ClaimsPage() {
  const {
    claims,
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    statusGroup,
    setStatusGroup,
    q,
    setQ,
    refetch,
    loadMore,
  } = useClaims();

  const activeChip: ChipKey = statusGroup ?? "all";

  // Group inferred from outcome for the empty-state copy when there are 0
  // claims AND a chip is active. When all chips are clear, we fall back to
  // "all" copy.
  const emptyChipKey: ChipKey =
    claims.length === 0 && statusGroup === null && q.length === 0 ? "all" : activeChip;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Claims</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Track drafts, submissions, and outcomes across every monitored purchase.
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-100 bg-background/80 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((chip) => {
              const isActive = chip.key === activeChip;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setStatusGroup(chip.key === "all" ? null : chip.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "border-brand-primary-500 bg-brand-primary-500 text-primary-foreground"
                      : "border-neutral-200 bg-neutral-0 text-neutral-700 hover:bg-neutral-50",
                  )}
                  aria-pressed={isActive}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search platform or product…"
              aria-label="Search claims"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {error !== null && claims.length === 0 ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton />
      ) : claims.length === 0 ? (
        <EmptyState chip={emptyChipKey} />
      ) : (
        <>
          <div className="hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm md:block">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead>Platform / Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Window / Resolved</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="w-[100px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <ClaimRow key={claim._id} claim={claim} />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {claims.map((claim) => (
              <ClaimCard key={claim._id} claim={claim} />
            ))}
          </div>

          {/* If a refresh failed AFTER the first page rendered, surface the
              error inline below the list — stale-while-error pattern, the
              user keeps their data while seeing why the refresh hiccuped. */}
          {error !== null ? (
            <div className="text-center">
              <ErrorState message={error.message} onRetry={refetch} />
            </div>
          ) : null}

          {nextCursor !== null ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                {isLoadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
