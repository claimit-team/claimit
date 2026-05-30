"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileEdit,
  Hotel,
  Mail,
  Plane,
  ShoppingBag,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { AutoSendBanner } from "@/components/dashboard/auto-send-banner";
import { HeroActiveUser } from "@/components/dashboard/hero/active-user";
import { HeroNewUser } from "@/components/dashboard/hero/new-user";
import { HeroReclaimExperienced } from "@/components/dashboard/hero/reclaim-experienced";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformLogo } from "@/components/ui/platform-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAwaitingOutcomeClaims } from "@/hooks/useAwaitingOutcomeClaims";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useMonitoredPurchases } from "@/hooks/useMonitoredPurchases";
import { usePendingConfirmation } from "@/hooks/usePendingConfirmation";
import { useQueuedForSendClaims } from "@/hooks/useQueuedForSendClaims";
import { useReviewDraft } from "@/hooks/useReviewDraft";
import type { ClaimListItem } from "@/lib/api/claims";
import type { RecentResolvedClaim } from "@/lib/api/dashboard";
import type { PurchaseListItem, PurchasesApiError } from "@/lib/api/purchases";
import { formatClaimCurrency } from "@/lib/claim-detail";
import {
  formatRelativeFromNow,
  formatWindowRemaining,
  snakeToTitleLabel,
} from "@/lib/claims-status";
import { getPlatformLabel } from "@/lib/platform-labels";
import { getListStatusBadge, isMonitoringDegraded } from "@/lib/purchase-status";
import { cn } from "@/lib/utils";
import { useAuthStore, useUIStore } from "@/store";

// ============================================================================
// USER STATE (dev override + auto-derived)
// ============================================================================

type UserState = "new" | "active" | "reclaim_experienced";

// ============================================================================
// PAGE HEADER + DEV STATE SWITCHER
// ============================================================================

function PageHeader({
  gmailConnected,
  onUploadClick,
  userState,
  onUserStateChange,
}: {
  gmailConnected: boolean;
  onUploadClick: () => void;
  userState: UserState;
  onUserStateChange: (next: UserState) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="text-neutral-600 mt-1">
          Monitor purchases, review claims, and keep your refund workflow moving.
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            gmailConnected
              ? "border-semantic-success text-semantic-success"
              : "border-neutral-300 text-neutral-500",
          )}
        >
          {gmailConnected ? (
            <>
              <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" />
              Gmail connected
            </>
          ) : (
            <>
              <Mail className="w-3 h-3 mr-1" aria-hidden="true" />
              Gmail not connected
            </>
          )}
        </Badge>
        {!gmailConnected && (
          <Link
            href="/settings/gmail"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Connect Gmail
          </Link>
        )}
        <Button
          size="sm"
          className="bg-brand-primary-500 hover:bg-brand-primary-600 text-neutral-0"
          onClick={onUploadClick}
        >
          <UploadCloud className="w-4 h-4 mr-2" aria-hidden="true" />
          Upload receipt
        </Button>
        {/* Dev-only userState switcher — not shipped to production builds */}
        {process.env.NODE_ENV === "development" && (
          <>
            <DevStateSwitcher value={userState} onChange={onUserStateChange} />
            <DevPulseTrigger />
          </>
        )}
      </div>
    </div>
  );
}

function DevPulseTrigger() {
  const setProactiveEvent = useUIStore((s) => s.setProactiveEvent);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        // Synthetic price_dropped payload so the Floating Panel renders
        // the full ProactiveCard (opening message + facts + actions),
        // not just the FAB pulse. notificationId is fake — the ack on
        // dismiss will 404, which the card swallows by design.
        setProactiveEvent({
          notificationId: "dev-pulse-trigger",
          eventType: "price_dropped",
          output: {
            opening_message:
              "Your Best Buy item just dropped $25.00. You have 12 hours left in the claim window — want me to file it?",
            key_facts: [
              "Platform: best_buy",
              "Refund amount: $25.00",
              "Window remaining: 12 hours",
            ],
            quick_actions: [
              { label: "Review draft", action: "navigate_claim" },
              { label: "Auto-file now", action: "approve_claim" },
            ],
          },
          data: null,
        });
        toast.info("Proactive event queued — watch the assistant FAB pulse.");
      }}
      className="border-dashed border-neutral-400 text-neutral-600"
    >
      Trigger pulse
    </Button>
  );
}

function DevStateSwitcher({
  value,
  onChange,
}: {
  value: UserState;
  onChange: (next: UserState) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "border-dashed border-neutral-400 text-neutral-600",
        )}
      >
        Dev: {value}
        <ChevronDown className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>User state (dev only)</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as UserState)}>
          <DropdownMenuRadioItem value="new">New user</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="active">Active user</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="reclaim_experienced">
            Reclaim experienced
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// SECTION HEADER
// ============================================================================

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ============================================================================
// NEEDS ATTENTION — item types (builders below)
// ============================================================================

type ConfirmExtractionItem = {
  type: "confirm_extraction";
  purchaseId: string;
  platform: string;
  title: string;
  lowConfidenceFields: string[];
  category: string | null;
};

type ReviewDraftItem = {
  type: "review_draft";
  claimId: string;
  platform: string;
  title: string;
  claimType: string;
  windowRemaining: string;
  category: string | null;
};

type AwaitingOutcomeItem = {
  type: "awaiting_outcome";
  claimId: string;
  platform: string;
  title: string;
  claimAmount: number;
  submittedLabel: string;
  category: string | null;
};

type NeedsAttentionItem = ReviewDraftItem | ConfirmExtractionItem | AwaitingOutcomeItem;

function getCategoryIcon(category: "retail" | "airline" | "hotel") {
  switch (category) {
    case "retail":
      return ShoppingBag;
    case "airline":
      return Plane;
    case "hotel":
      return Hotel;
  }
}

function getCategoryFallbackIcon(category: string | null | undefined) {
  if (category === "retail" || category === "airline" || category === "hotel") {
    return getCategoryIcon(category);
  }
  return ShoppingBag;
}

function ReviewDraftCard({
  claimId,
  platform,
  title,
  claimType,
  windowRemaining,
  category,
}: ReviewDraftItem) {
  if (!claimId) return null;

  return (
    <Link
      href={`/claims/${claimId}`}
      className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2"
      aria-label={`Review draft for ${title}`}
    >
      <Card className="h-full border-neutral-200 transition-[border-color,box-shadow] duration-200 hover:border-neutral-300 hover:shadow-sm">
        <CardContent className="flex h-full flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-neutral-50 ring-1 ring-neutral-200/70">
              <PlatformLogo
                platform={platform}
                fallbackIcon={getCategoryFallbackIcon(category)}
                size={30}
              />
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                "bg-brand-primary-100 text-brand-primary-700",
              )}
            >
              <FileEdit className="size-3.5" aria-hidden />
              Review needed
            </span>
          </div>
          <div className="mt-5">
            <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-neutral-900">
              {title}
            </p>
            <p className="mt-1.5 text-sm text-neutral-600">
              {platform} · {snakeToTitleLabel(claimType)}
            </p>
            <p className="mt-2 text-xs text-neutral-500">Window {windowRemaining}</p>
          </div>
          <div className="mt-auto flex items-center justify-end gap-1 pt-5 text-sm font-medium text-brand-primary-600">
            Review draft
            <ChevronRight className="size-4" aria-hidden />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ConfirmExtractionCard({
  purchaseId,
  platform,
  title,
  lowConfidenceFields,
  category,
}: ConfirmExtractionItem) {
  if (!purchaseId) return null;

  return (
    <Link
      href={`/confirm/${purchaseId}?from=/dashboard`}
      className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2"
      aria-label={`Confirm details for ${title}`}
    >
      <Card className="h-full border-neutral-200 transition-[border-color,box-shadow] duration-200 hover:border-neutral-300 hover:shadow-sm">
        <CardContent className="flex h-full flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-neutral-50 ring-1 ring-neutral-200/70">
              <PlatformLogo
                platform={platform}
                fallbackIcon={getCategoryFallbackIcon(category)}
                size={30}
              />
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                "bg-amber-100 text-amber-700",
              )}
            >
              <CheckCircle2 className="size-3.5" aria-hidden />
              Confirm details
            </span>
          </div>
          <div className="mt-5">
            <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-neutral-900">
              {title}
            </p>
            <p className="mt-1.5 text-sm text-neutral-600">{platform}</p>
            <p className="mt-2 text-xs text-neutral-500">
              Low confidence: {lowConfidenceFields.join(", ")}
            </p>
          </div>
          <div className="mt-auto flex items-center justify-end gap-1 pt-5 text-sm font-medium text-brand-primary-600">
            Confirm details
            <ChevronRight className="size-4" aria-hidden />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AwaitingOutcomeCard({
  claimId,
  platform,
  title,
  submittedLabel,
  category,
}: AwaitingOutcomeItem) {
  if (!claimId) return null;

  return (
    <Link
      href={`/claims/${claimId}`}
      className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-500 focus-visible:ring-offset-2"
      aria-label={`Record outcome for ${title}`}
    >
      <Card className="h-full border-neutral-200 transition-[border-color,box-shadow] duration-200 hover:border-neutral-300 hover:shadow-sm">
        <CardContent className="flex h-full flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-neutral-50 ring-1 ring-neutral-200/70">
              <PlatformLogo
                platform={platform}
                fallbackIcon={getCategoryFallbackIcon(category)}
                size={30}
              />
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                "bg-orange-100 text-orange-700",
              )}
            >
              <Clock className="size-3.5" aria-hidden />
              Needs your update
            </span>
          </div>
          <div className="mt-5">
            <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-neutral-900">
              {title}
            </p>
            <p className="mt-1.5 text-sm text-neutral-600">{platform}</p>
            <p className="mt-2 text-xs text-neutral-500">Submitted {submittedLabel}</p>
          </div>
          <div className="mt-auto flex items-center justify-end gap-1 pt-5 text-sm font-medium text-brand-primary-600">
            Record outcome
            <ChevronRight className="size-4" aria-hidden />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Confidence threshold mirroring B5 — kept inline (3 places, all FE)
 * rather than promoting to a shared module. Renaming the constant
 * later is a single rg-replace.
 */
const CONFIDENCE_THRESHOLD = 0.95;
const AWAITING_OUTCOME_MIN_DAYS = 3;

/**
 * Map an `outcome=draft_pending` claim row to the dashboard's
 * `ReviewDraftCard` shape. Falls back to neutral defaults so a
 * partial / read-tolerant row never crashes the section.
 */
function buildReviewDraftItems(claims: ClaimListItem[]): ReviewDraftItem[] {
  return claims
    .filter(
      // Empty-string `_id` would generate a broken `/claims/` link
      // and unstable React key — reject alongside null/undefined
      // (CodeRabbit MINOR, PR #168).
      (c): c is ClaimListItem & { _id: string } =>
        typeof c._id === "string" && c._id.trim().length > 0,
    )
    .map((c) => ({
      type: "review_draft" as const,
      claimId: c._id,
      platform: getPlatformLabel(c.platform),
      title: c.product_name ?? "Untitled claim",
      claimType: typeof c.claim_type === "string" ? c.claim_type : "email",
      windowRemaining: formatWindowRemaining(c.window_expires),
      category: typeof c.category === "string" ? c.category : null,
    }));
}

function buildAwaitingOutcomeItems(claims: ClaimListItem[]): AwaitingOutcomeItem[] {
  return claims
    .filter((c): c is ClaimListItem & { _id: string; submitted_at: string } => {
      if (typeof c._id !== "string" || c._id.trim().length === 0) return false;
      if (c.submitted_at === null) return false;
      const ms = Date.parse(c.submitted_at);
      if (Number.isNaN(ms)) return false;
      const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
      return days >= AWAITING_OUTCOME_MIN_DAYS;
    })
    .map((c) => ({
      type: "awaiting_outcome" as const,
      claimId: c._id,
      platform: getPlatformLabel(c.platform),
      title: c.product_name ?? "Untitled claim",
      claimAmount: c.claim_amount ?? 0,
      submittedLabel: formatRelativeFromNow(c.submitted_at),
      category: typeof c.category === "string" ? c.category : null,
    }));
}

/**
 * Map a `pending_confirmation` purchase row to the
 * `ConfirmExtractionCard` shape. The card surfaces the same low-
 * confidence-field list the confirm-page banner renders (the
 * threshold + field-set definition lives in
 * `confirm-purchase-content.deriveLowConfidenceFields`) — but we
 * derive it inline here rather than importing because the dashboard
 * card is intentionally lossy (it doesn't need the price/price_paid
 * collapse, doesn't need the mostly-failed/named-low split, just a
 * short hint of what's wrong).
 *
 * Returns `null` for docs whose extraction hasn't landed yet (the
 * sentinel `overall_min=0` shape). Surfacing a confirm card with
 * "everything is low" before extraction completes would mislead the
 * user; the confirm page itself shows the "Analyzing your receipt…"
 * polling UX in that state.
 */
function buildConfirmExtractionItems(purchases: PurchaseListItem[]): ConfirmExtractionItem[] {
  const out: ConfirmExtractionItem[] = [];
  for (const p of purchases) {
    const conf = p.extraction_confidence;
    // Skip sentinel / pre-extraction shapes — the dashboard shouldn't
    // surface "0 fields low" or "everything low" before Gemini
    // returns.
    if (!conf) continue;
    const overall = conf.overall_min;
    if (overall === null || overall === undefined || overall === 0) continue;

    // Dedupe by human label rather than raw key. Multiple confidence
    // keys can map to the same form field (e.g. `price` and
    // `price_paid` both surface as "Purchase price" via
    // `DASHBOARD_FIELD_LABEL`); without dedupe the card would list
    // "Purchase price, Purchase price" on a doc whose price came in
    // with low confidence on both keys.
    const lowFields: string[] = [];
    for (const [key, value] of Object.entries(conf)) {
      if (key === "overall_min") continue;
      if (value === null || value === undefined) continue;
      if (value < CONFIDENCE_THRESHOLD) {
        const label = humanizeField(key);
        if (!lowFields.includes(label)) lowFields.push(label);
      }
    }

    // Pending-confirmation rows reach this branch with overall_min <
    // 0.95 (the backend's own threshold for keeping the doc in this
    // status), so SOMETHING is low. But `lowFields` only carries
    // fields whose per-field confidence is both non-null AND
    // below the threshold — a doc whose only low-confidence signal
    // came in as a null (read-tolerant doc shape, legacy seed, or a
    // field the FE doesn't have a label for) could collapse to zero
    // visible entries here. The card would then render the bare
    // "Low confidence:" label with nothing after it. Surface a
    // generic prompt so the row never reads as broken.
    out.push({
      type: "confirm_extraction",
      purchaseId: p._id,
      platform: getPlatformLabel(p.platform),
      title: p.product_name ?? "Untitled purchase",
      lowConfidenceFields: lowFields.length > 0 ? lowFields : ["Review extracted details"],
      category: typeof p.category === "string" ? p.category : null,
    });
  }
  return out;
}

const DASHBOARD_FIELD_LABEL: Record<string, string> = {
  platform: "Platform",
  product_name: "Product name",
  price: "Purchase price",
  price_paid: "Purchase price",
  member_price_at_purchase: "Member price",
  non_member_price_at_purchase: "Non-member price",
  purchase_date: "Purchase date",
  order_id: "Order ID",
  category: "Category",
  member_tier_at_purchase: "Member tier",
  variant: "Variant",
  fare_class: "Fare class",
  room_type: "Room type",
  bed_type: "Bed type",
  rate_type: "Rate type",
};
function humanizeField(field: string): string {
  return DASHBOARD_FIELD_LABEL[field] ?? field.replace(/_/g, " ");
}

function buildRecentActivityText(item: RecentResolvedClaim): string {
  const platform = getPlatformLabel(item.platform);
  const outcome = snakeToTitleLabel(item.outcome);
  const isWinning = item.outcome === "approved" || item.outcome === "user_self_service";
  return isWinning
    ? `${platform} claim ${outcome} · ${formatClaimCurrency(item.amount)}`
    : `${platform} claim ${outcome}`;
}

function NeedsAttentionSection({ items }: { items: NeedsAttentionItem[] }) {
  return (
    <section>
      <SectionHeader title="Needs your attention" />

      {items.length === 0 ? (
        <Card className="border-neutral-200">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-neutral-300 mb-3" aria-hidden="true" />
            <p className="text-neutral-700 font-medium">Nothing needs your attention right now.</p>
            <p className="text-sm text-neutral-500 mt-1">
              ClaimIt will surface drafts, confirmations, and outcome updates here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 auto-rows-fr gap-6 lg:grid-cols-2">
          {items.map((item) => {
            if (item.type === "awaiting_outcome") {
              return <AwaitingOutcomeCard key={item.claimId} {...item} />;
            }
            if (item.type === "review_draft") {
              return <ReviewDraftCard key={item.claimId} {...item} />;
            }
            if (item.type === "confirm_extraction") {
              return <ConfirmExtractionCard key={item.purchaseId} {...item} />;
            }
            return null;
          })}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// MONITORED PURCHASES
// ============================================================================

function MonitoredPurchaseRow({ purchase }: { purchase: PurchaseListItem }) {
  const router = useRouter();
  const href = `/purchases/${purchase._id}`;
  const cat = purchase.category;
  const Icon =
    cat === "retail" || cat === "airline" || cat === "hotel" ? getCategoryIcon(cat) : ShoppingBag;
  const statusBadge = getListStatusBadge(purchase.status);
  const degraded = isMonitoringDegraded(purchase.status);

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
      className="cursor-pointer transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary-500"
    >
      <TableCell className="px-4 py-3 text-sm font-medium text-neutral-900">
        {getPlatformLabel(purchase.platform)}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-neutral-700">
        {purchase.product_name ?? "—"}
      </TableCell>
      <TableCell className="px-4 py-3">
        <Badge variant="outline" className="text-xs capitalize">
          <Icon className="mr-1 size-3" aria-hidden="true" />
          {snakeToTitleLabel(purchase.category)}
        </Badge>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5">
          <Badge variant="outline" className={cn("text-xs capitalize", statusBadge.className)}>
            {statusBadge.label}
          </Badge>
          {degraded ? (
            <span
              role="img"
              aria-label="Monitoring partially degraded"
              title="Monitoring is partially degraded — last price check returned no data."
              className="inline-block size-2 rounded-full bg-semantic-warning"
            />
          ) : null}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-neutral-600">
        {formatWindowRemaining(purchase.window_expires)}
      </TableCell>
    </TableRow>
  );
}

// Skeleton row keys — fixed 5-row layout matches the dashboard section's
// default visible slice (see useMonitoredPurchases DEFAULT_LIMIT). Stable
// hand-rolled keys satisfy React's key constraint without an index.
const MONITORED_SKELETON_KEYS = ["msk-1", "msk-2", "msk-3", "msk-4", "msk-5"] as const;

function MonitoredPurchasesSection({
  purchases,
  isLoading,
  error,
}: {
  purchases: PurchaseListItem[];
  isLoading: boolean;
  error: PurchasesApiError | null;
}) {
  return (
    <section>
      <SectionHeader
        title="Monitored purchases"
        action={
          <Link
            href="/purchases"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex items-center",
            )}
          >
            View all purchases
            <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
          </Link>
        }
      />

      <Card className="border-neutral-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                    Platform
                  </th>
                  <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                    Item
                  </th>
                  <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                    Category
                  </th>
                  <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider px-4 py-3">
                    Window
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {isLoading && purchases.length === 0 ? (
                  // Skeleton rows preserve the section's layout slot so
                  // the page doesn't reflow once data lands.
                  MONITORED_SKELETON_KEYS.map((key) => (
                    <tr key={key}>
                      <td colSpan={5} className="px-4 py-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : error !== null && purchases.length === 0 ? (
                  // Honest error state: a fetch failure is NOT the same
                  // as "user has nothing monitored" — surface it as a
                  // muted info row so the user knows the call didn't
                  // succeed. Non-blocking; the rest of the dashboard
                  // keeps rendering.
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-500">
                      Couldn't load monitored purchases.
                    </td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-500">
                      No purchases being monitored yet.
                    </td>
                  </tr>
                ) : (
                  purchases.map((purchase) => (
                    <MonitoredPurchaseRow key={purchase._id} purchase={purchase} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================================
// QUICK UPLOAD
// ============================================================================

function QuickUploadSection({ gmailConnected }: { gmailConnected: boolean }) {
  // Ticket 5.14 B2: the dashboard "quick upload" tile is now a
  // shortcut into the global upload dialog. The previous
  // simulate-progress mock is gone — real upload state lives inside
  // the dialog so we don't paint a fake loader here.
  const openUploadDialog = useUIStore((s) => s.setUploadDialogOpen);

  return (
    <section>
      <SectionHeader title="Quick upload" />
      <Card className="border-neutral-200">
        <CardContent className="p-4">
          <button
            type="button"
            onClick={() => openUploadDialog(true)}
            className="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 px-6 py-7 text-center transition-colors hover:border-neutral-400 hover:bg-neutral-50"
          >
            <UploadCloud className="mb-2 h-7 w-7 text-neutral-400" aria-hidden="true" />
            <span className="mb-2 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-neutral-0 px-3 py-1.5 text-sm font-medium text-neutral-700">
              Browse files
            </span>
            <p className="text-xs text-neutral-500">PDF, PNG, or JPG up to 10 MB</p>
          </button>

          {!gmailConnected && (
            <Link
              href="/settings/gmail"
              className="mt-3 inline-block text-xs text-brand-primary-600 hover:text-brand-primary-700"
            >
              Or connect Gmail →
            </Link>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================================
// RECENT ACTIVITY
// ============================================================================

function RecentActivitySection({ items }: { items: RecentResolvedClaim[] }) {
  return (
    <section>
      <SectionHeader title="Recently resolved" />
      <Card className="border-neutral-200">
        <CardContent className="p-4">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              Your resolved claims will appear here.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.claim_id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neutral-300" />
                  <div className="min-w-0 flex-1 text-neutral-700">
                    {buildRecentActivityText(item)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

function HeroSkeleton() {
  return (
    <Card className="border-neutral-200">
      <CardContent className="p-6 lg:p-8 space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  // Dev override: when null, userState is auto-derived from /dashboard/summary
  // (see Amendment 1). Persisted only in component state — not localStorage —
  // so a hard refresh always shows the auto-derived state, mirroring what
  // real users see.
  const [userStateOverride, setUserStateOverride] = useState<UserState | null>(null);

  const {
    summary,
    isLoading: isSummaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useDashboardSummary();
  // gmailConnected reads from auth store (AuthInit populates user via getMe()).
  // Previously read from mockDashboardData.gmailConnected, which masked the
  // real backend state — accounts with gmail_integration.connected=true in
  // Mongo were rendering as "not connected" in the dashboard header.
  const gmailConnected = useAuthStore((s) => s.user?.gmail_integration?.connected ?? false);
  const {
    purchases: monitoredPurchases,
    isLoading: isMonitoredLoading,
    error: monitoredError,
  } = useMonitoredPurchases();
  const { purchases: pendingPurchases } = usePendingConfirmation();
  const { claims: reviewDraftClaims } = useReviewDraft();
  const { claims: awaitingClaims } = useAwaitingOutcomeClaims();
  // Ticket 5.15 / WI-9: hydrate the auto-send banner store with the
  // current queued_for_send slice. Live updates after this come via
  // the SSE fanout in useProactiveAssistant (no polling).
  useQueuedForSendClaims();

  const needsAttention: NeedsAttentionItem[] = [
    ...buildConfirmExtractionItems(pendingPurchases),
    ...buildReviewDraftItems(reviewDraftClaims),
    ...buildAwaitingOutcomeItems(awaitingClaims),
  ];

  // Auto-derive userState from real summary data:
  // - lifetime_savings > 0 → user has resolved claims → "reclaim_experienced"
  // - else if any active claims or monitored purchases → "active"
  // - else (or while loading) → "new" (empty-state hero, no mock-data hybrid)
  const computedUserState: UserState = !summary
    ? "new"
    : summary.total_savings_lifetime > 0
      ? "reclaim_experienced"
      : summary.monitoring_purchases_count > 0 || summary.active_claims_count > 0
        ? "active"
        : "new";

  const userState: UserState = userStateOverride ?? computedUserState;

  // Ticket 5.14 B2: dashboard upload CTAs now open the same global
  // upload dialog the sidebar Upload button opens. The mock "queued"
  // toasts are gone — the dialog itself surfaces real upload state +
  // routes to /confirm/:id on success.
  const openUploadDialog = useUIStore((s) => s.setUploadDialogOpen);
  const handleUploadClick = () => openUploadDialog(true);
  const handleBrowseFiles = () => openUploadDialog(true);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
      <div className="space-y-10">
        <PageHeader
          gmailConnected={gmailConnected}
          onUploadClick={handleUploadClick}
          userState={userState}
          onUserStateChange={setUserStateOverride}
        />

        {summaryError && summaryError.code !== "unauthenticated" && (
          <Alert variant="destructive">
            <AlertTitle>We couldn&apos;t load your savings summary.</AlertTitle>
            <AlertDescription>
              <p className="mb-3 text-sm">{summaryError.message}</p>
              <p className="mb-3 text-sm text-neutral-600">
                The rest of the dashboard is still available below.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={refetchSummary}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isSummaryLoading && !summary ? (
          <HeroSkeleton />
        ) : (
          <>
            {userState === "new" && <HeroNewUser onBrowseFiles={handleBrowseFiles} />}
            {userState === "active" && summary && (
              <HeroActiveUser
                claimsInProgress={summary.active_claims_count}
                purchasesMonitored={summary.monitoring_purchases_count}
              />
            )}
            {userState === "reclaim_experienced" && summary && (
              <HeroReclaimExperienced
                reclaimedThisMonth={summary.total_savings_month}
                claimsInProgress={summary.active_claims_count}
                lifetimeReclaimed={summary.total_savings_lifetime}
                purchasesMonitored={summary.monitoring_purchases_count}
              />
            )}
            {/* Override fallback: if dev forces "active"/"reclaim_experienced"
                before summary loads, render skeleton rather than crashing. */}
            {userState !== "new" && !summary && <HeroSkeleton />}
          </>
        )}

        {userState !== "new" && <AutoSendBanner />}

        {userState !== "new" && <NeedsAttentionSection items={needsAttention} />}

        {userState !== "new" && (
          <MonitoredPurchasesSection
            purchases={monitoredPurchases}
            isLoading={isMonitoredLoading}
            error={monitoredError}
          />
        )}

        {/* Quick Upload + Recent Activity grid is hidden in the new-user state
            because HeroNewUser already renders an upload CTA at the top —
            otherwise new users see two upload regions on the same page. */}
        {userState !== "new" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <QuickUploadSection gmailConnected={gmailConnected} />
            <RecentActivitySection items={summary?.recent_resolved ?? []} />
          </div>
        )}
      </div>
    </div>
  );
}
