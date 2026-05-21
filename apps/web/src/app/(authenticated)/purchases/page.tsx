"use client";

/**
 * /purchases — fleet-view list of the authenticated user's purchases.
 *
 * Real-ified in PR2 (was previously a mock client filter over
 * `lib/mock-purchases.ts`). Mirrors the 5.4 claims-list shape
 * (`/claims/page.tsx`) — sticky filter bar + desktop table + mobile
 * card stack, skeleton / empty / error states, debounced search,
 * cursor pagination. Differences vs claims list:
 *  - Filter chips are CATEGORY (All / Retail / Airline / Hotel) — no
 *    status chips (v0 prompt + locked decision 3). Status is shown
 *    per row via `getListStatusBadge` (all 8 backend values).
 *  - Source of receipt is shown as an ICON only (no source filter
 *    until the backend grows a param — locked decision 3).
 *  - No `ClaimOutcomeBadge` here (locked decision 4) — purchases
 *    surface monitoring state, not claim outcome.
 */

import type { Category, IngestionSource, PurchaseStatus } from "@claimit/mongodb-types";
import { Hotel, Mail, Plane, Search, ShoppingBag, Upload } from "lucide-react";
import Link from "next/link";

import { PlatformLogo } from "@/components/claims/platform-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { usePurchases } from "@/hooks/usePurchases";
import type { PurchaseListItem } from "@/lib/api/purchases";
import { formatWindowRemaining, snakeToTitleLabel } from "@/lib/claims-status";
import { getListStatusBadge, isMonitoringDegraded } from "@/lib/purchase-status";
import { cn } from "@/lib/utils";

// --- chip group config ---------------------------------------------------

// Category values mirror the backend `Category` enum 1:1. The list
// endpoint accepts the raw enum string, so the chip key IS the query
// param value when set (or null = no filter).
type CategoryChipKey = "all" | Category;
const CATEGORY_CHIPS: { key: CategoryChipKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "retail", label: "Retail" },
  { key: "airline", label: "Airline" },
  { key: "hotel", label: "Hotel" },
];

// --- empty-state copy ----------------------------------------------------
//
// v0 §4 explicitly forbids potential-refund / money totals on the list,
// so empty copy stays informational. Per locked decision: separate
// copy for the all-empty case vs filter/search-narrowed-empty.

const EMPTY_ALL = {
  title: "Nothing being monitored",
  body: "Upload a receipt to start monitoring price drops, fare changes, or refund windows.",
  ctaHref: "/upload",
  ctaLabel: "Upload a receipt",
};

const EMPTY_CATEGORY_OR_SEARCH = {
  title: "No purchases match this view",
  body: "Try a different category or clear your search.",
};

// --- formatting helpers --------------------------------------------------

// Null-safe currency. Backend may carry null for either price or
// currency on a tolerant row — surface as "—" rather than crashing.
function formatCurrency(amount: number | null, currency: string | null): string {
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

// --- source icon ---------------------------------------------------------
//
// v0 §4: source ICON only (no text label, no filter). Tooltip via the
// native `title` attribute is sufficient for a11y; a richer popover
// can land alongside the source filter when that ships.

function SourceIcon({ source }: { source: IngestionSource | string | null }) {
  const iconClass = "h-4 w-4 text-neutral-500";
  switch (source) {
    case "gmail":
      return <Mail className={iconClass} aria-label="From Gmail" />;
    case "upload_pdf":
    case "upload_image":
      return <Upload className={iconClass} aria-label="Uploaded receipt" />;
    default:
      // Null / unknown ingestion source — keep the slot visible so the
      // column doesn't reflow row-to-row, but use a neutral square that
      // reads as "no source signal" rather than "this is a Gmail row".
      return (
        <span
          role="img"
          aria-label="Source unknown"
          className="inline-block h-2 w-2 rounded-full bg-neutral-300"
        />
      );
  }
}

// --- category icon (mobile card + table cell hint) -----------------------

function categoryIcon(category: string | null) {
  switch (category) {
    case "airline":
      return <Plane className="h-3 w-3" aria-hidden />;
    case "hotel":
      return <Hotel className="h-3 w-3" aria-hidden />;
    default:
      // Retail + unknown both render as the generic bag — matches the
      // PlatformLogo fallback semantic.
      return <ShoppingBag className="h-3 w-3" aria-hidden />;
  }
}

// --- status cell ---------------------------------------------------------
//
// `getListStatusBadge` returns a label + className for all 8 backend
// statuses + an honest "Unknown" fallback for rogue values. The degraded
// dot is rendered separately so we can keep the badge palette stable
// for `monitoring_degraded` (it shares the brand-primary chip with
// plain `monitoring`).

function StatusCell({ status }: { status: PurchaseStatus | string | null }) {
  const badge = getListStatusBadge(status);
  const degraded = isMonitoringDegraded(status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline" className={cn("shrink-0 capitalize", badge.className)}>
        {badge.label}
      </Badge>
      {degraded ? (
        <span
          role="img"
          aria-label="Monitoring partially degraded"
          title="Monitoring is partially degraded — last price check returned no data. ClaimIt will retry automatically."
          className="inline-block h-2 w-2 rounded-full bg-semantic-warning"
        />
      ) : null}
    </span>
  );
}

// --- skeleton / empty / error --------------------------------------------

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

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  if (isFiltered) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="py-10 text-center">
          <h3 className="text-base font-medium text-neutral-900">
            {EMPTY_CATEGORY_OR_SEARCH.title}
          </h3>
          <p className="mt-2 text-sm text-neutral-600">{EMPTY_CATEGORY_OR_SEARCH.body}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-3 py-10 text-center">
        <h3 className="text-base font-medium text-neutral-900">{EMPTY_ALL.title}</h3>
        <p className="text-sm text-neutral-600">{EMPTY_ALL.body}</p>
        <Link
          href={EMPTY_ALL.ctaHref}
          className={cn(buttonVariants({ size: "sm" }), "inline-flex")}
        >
          {EMPTY_ALL.ctaLabel}
        </Link>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert className="mx-auto max-w-xl">
      <AlertTitle>Couldn&apos;t load purchases</AlertTitle>
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

function PurchaseRow({ purchase }: { purchase: PurchaseListItem }) {
  return (
    <TableRow>
      <TableCell className="w-[40px]">
        <SourceIcon source={purchase.ingestion_source} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <PlatformLogo platform={purchase.platform} category={purchase.category} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-neutral-900">
              {purchase.product_name ?? "—"}
            </span>
            <span className="text-xs text-neutral-500 capitalize">
              {snakeToTitleLabel(purchase.platform)}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          <span className="mr-1 inline-flex items-center">{categoryIcon(purchase.category)}</span>
          {snakeToTitleLabel(purchase.category)}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-medium text-neutral-700 tabular-nums">
        {formatCurrency(purchase.price_paid, purchase.currency)}
      </TableCell>
      <TableCell className="text-sm text-neutral-500">
        {formatDateShort(purchase.purchase_date)}
      </TableCell>
      <TableCell>
        <StatusCell status={purchase.status} />
      </TableCell>
      <TableCell className="text-sm text-neutral-700">
        {formatWindowRemaining(purchase.window_expires)}
      </TableCell>
      <TableCell className="text-right">
        <Button render={<Link href={`/purchases/${purchase._id}`} />} size="sm" variant="outline">
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

function PurchaseCard({ purchase }: { purchase: PurchaseListItem }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between">
          <StatusCell status={purchase.status} />
          <span className="font-medium tabular-nums text-neutral-700">
            {formatCurrency(purchase.price_paid, purchase.currency)}
          </span>
        </div>
        <div className="flex items-start gap-3">
          <PlatformLogo platform={purchase.platform} category={purchase.category} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-neutral-900">
              {purchase.product_name ?? "—"}
            </span>
            <span className="text-xs text-neutral-500 capitalize">
              {snakeToTitleLabel(purchase.platform)} · {snakeToTitleLabel(purchase.category)}
            </span>
          </div>
          <SourceIcon source={purchase.ingestion_source} />
        </div>
        <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          <span>{formatWindowRemaining(purchase.window_expires)}</span>
          <Link
            href={`/purchases/${purchase._id}`}
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

export default function PurchasesPage() {
  const {
    purchases,
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    category,
    setCategory,
    q,
    setQ,
    refetch,
    loadMore,
  } = usePurchases();

  const activeChip: CategoryChipKey = (category as CategoryChipKey | null) ?? "all";
  const isFiltered = category !== null || q.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-8">
      <div>
        <h1 className="font-semibold text-2xl text-neutral-900">Purchases</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Every receipt we monitor — see status, timelines, and what needs action.
        </p>
      </div>

      <div className="-mx-4 lg:-mx-8 sticky top-0 z-10 border-neutral-100 border-b bg-background/80 px-4 py-3 backdrop-blur lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_CHIPS.map((chip) => {
              const isActive = chip.key === activeChip;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setCategory(chip.key === "all" ? null : chip.key)}
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
              className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-neutral-400"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search platform, product, or order…"
              aria-label="Search purchases"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {error !== null && purchases.length === 0 ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton />
      ) : purchases.length === 0 ? (
        <EmptyState isFiltered={isFiltered} />
      ) : (
        <>
          <div className="hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm md:block">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px]" />
                  <TableHead>Platform / Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price paid</TableHead>
                  <TableHead>Purchase date</TableHead>
                  <TableHead className="w-[200px]">Status</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="w-[100px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <PurchaseRow key={p._id} purchase={p} />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {purchases.map((p) => (
              <PurchaseCard key={p._id} purchase={p} />
            ))}
          </div>

          {/* Stale-while-error: when a same-key refetch fails AFTER the
              first page rendered, the hook keeps the rows and surfaces
              the error inline below the list so the user keeps their
              data. */}
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
