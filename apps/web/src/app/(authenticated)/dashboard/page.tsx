"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Hotel,
  Mail,
  Plane,
  ShoppingBag,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { HeroActiveUser } from "@/components/dashboard/hero/active-user";
import { HeroNewUser } from "@/components/dashboard/hero/new-user";
import { HeroReclaimExperienced } from "@/components/dashboard/hero/reclaim-experienced";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { cn } from "@/lib/utils";
import { useAuthStore, useUIStore } from "@/store";

// ============================================================================
// MOCK DATA
// ============================================================================

type UserState = "new" | "active" | "reclaim_experienced";

const mockDashboardData = {
  needsAttention: [
    {
      type: "review_draft" as const,
      claimId: "claim_001",
      platform: "Best Buy",
      title: "Sony WH-1000XM5",
      claimType: "chat_script",
      windowRemaining: "11 days remaining",
    },
    {
      type: "update_needed" as const,
      claimId: "claim_002",
      platform: "Hilton",
      title: "Hilton Waikiki stay",
      submittedDaysAgo: 6,
      claimType: "email",
      requestedAmount: 74,
    },
    {
      type: "confirm_extraction" as const,
      purchaseId: "purchase_delta_003",
      platform: "Delta",
      title: "MIA → LAX flight",
      lowConfidenceFields: ["fare_class", "purchase_date"],
    },
  ],
  monitoredPurchases: [
    {
      purchaseId: "purchase_001",
      platform: "Best Buy",
      title: "Sony WH-1000XM5",
      category: "retail" as const,
      status: "monitoring" as const,
      windowRemaining: "11 days remaining",
    },
    {
      purchaseId: "purchase_002",
      platform: "Southwest",
      title: "LAX → MIA",
      category: "airline" as const,
      status: "claim drafted" as const,
      windowRemaining: "Before departure",
    },
    {
      purchaseId: "purchase_003",
      platform: "Hilton",
      title: "Hilton Waikiki stay",
      category: "hotel" as const,
      status: "submitted" as const,
      windowRemaining: "Outcome needed",
    },
    {
      purchaseId: "purchase_004",
      platform: "Amazon",
      title: "AirPods Pro 2",
      category: "retail" as const,
      status: "monitoring" as const,
      windowRemaining: "22 days remaining",
    },
    {
      purchaseId: "purchase_005",
      platform: "Delta",
      title: "NYC → LAX",
      category: "airline" as const,
      status: "window ending soon" as const,
      windowRemaining: "3 days remaining",
    },
  ],
  recentActivity: [
    { text: "You marked a Hilton claim approved", time: "2 minutes ago" },
    { text: "Claim Agent drafted a Best Buy chat script", time: "1 hour ago" },
    { text: "Monitor Agent checked Southwest pricing", time: "3 hours ago" },
    { text: "Ingest Agent added a receipt from Gmail", time: "Yesterday" },
    { text: "Assistant explained a Best Buy policy clause", time: "Yesterday" },
  ],
};

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
        {process.env.NODE_ENV !== "production" && (
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
// NEEDS ATTENTION
// ============================================================================

function ReviewDraftCard({
  claimId,
  platform,
  title,
  claimType,
  windowRemaining,
}: {
  claimId: string;
  platform: string;
  title: string;
  claimType: string;
  windowRemaining: string;
}) {
  return (
    <Card className="border-neutral-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Badge
              variant="secondary"
              className="mb-2 bg-brand-primary-50 text-brand-primary-700 border-0"
            >
              Review needed
            </Badge>
            <div className="font-medium text-neutral-900 truncate">
              {platform} · {title}
            </div>
            <div className="flex items-center gap-3 mt-2 text-sm text-neutral-600 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {claimType === "chat_script" ? "Chat script" : claimType}
              </Badge>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                {windowRemaining}
              </span>
            </div>
          </div>
          <Link href={`/claims/${claimId}`} className={cn(buttonVariants({ size: "sm" }))}>
            Review draft
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmExtractionCard({
  purchaseId,
  platform,
  title,
  lowConfidenceFields,
}: {
  purchaseId: string;
  platform: string;
  title: string;
  lowConfidenceFields: string[];
}) {
  return (
    <Card className="border-neutral-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Badge
              variant="secondary"
              className="mb-2 bg-semantic-warning-bg text-semantic-warning border-0"
            >
              Confirm details
            </Badge>
            <div className="font-medium text-neutral-900 truncate">
              {platform} · {title}
            </div>
            <div className="text-sm text-neutral-600 mt-1">
              Low confidence: {lowConfidenceFields.join(", ")}
            </div>
          </div>
          <Link
            href={`/confirm/${purchaseId}`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Confirm purchase
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function UpdateNeededCard({
  claimId,
  platform,
  title,
  submittedDaysAgo,
  claimType,
  requestedAmount,
  onDismiss,
}: {
  claimId: string;
  platform: string;
  title: string;
  submittedDaysAgo: number;
  claimType: string;
  requestedAmount?: number;
  onDismiss: () => void;
}) {
  const [expandedAction, setExpandedAction] = useState<"approved" | "denied" | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [denialReason, setDenialReason] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleStillWaiting = () => {
    toast.success("Thanks. We'll remind you later.");
    setDismissed(true);
    onDismiss();
  };

  const handleSaveApproved = () => {
    toast.success("Outcome recorded. Reclaimed amount updated from your report.");
    setDismissed(true);
    onDismiss();
  };

  const handleSaveDenied = () => {
    toast.success("Outcome recorded. Claim marked denied.");
    setDismissed(true);
    onDismiss();
  };

  return (
    <Card className={cn("border-neutral-200 transition-opacity", dismissed && "opacity-50")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <Badge variant="secondary" className="mb-2 bg-neutral-100 text-neutral-700 border-0">
              Update needed
            </Badge>
            <div className="font-medium text-neutral-900">
              {platform} claim submitted {submittedDaysAgo} days ago
            </div>
            <div className="text-sm text-neutral-600 mt-1">
              {title} · {claimType === "email" ? "Email" : claimType}
              {requestedAmount && ` · Requested $${requestedAmount}`}
            </div>
          </div>
        </div>

        {!expandedAction && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setExpandedAction("approved")}>
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-semantic-success" aria-hidden="true" />
              Mark approved
            </Button>
            <Button size="sm" variant="outline" onClick={() => setExpandedAction("denied")}>
              <X className="w-4 h-4 mr-1.5 text-semantic-danger" aria-hidden="true" />
              Mark denied
            </Button>
            <Button size="sm" variant="ghost" onClick={handleStillWaiting}>
              <Clock className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Still waiting
            </Button>
          </div>
        )}

        {expandedAction === "approved" && (
          <div className="mt-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <label
              htmlFor={`refund-amount-${claimId}`}
              className="block text-sm font-medium text-neutral-700 mb-2"
            >
              Refund amount
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-32">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                <Input
                  id={`refund-amount-${claimId}`}
                  type="number"
                  placeholder="0.00"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
              <Button size="sm" onClick={handleSaveApproved}>
                Save outcome
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setExpandedAction(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {expandedAction === "denied" && (
          <div className="mt-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <label
              htmlFor={`denial-reason-${claimId}`}
              className="block text-sm font-medium text-neutral-700 mb-2"
            >
              What reason did they give?
            </label>
            <Textarea
              id={`denial-reason-${claimId}`}
              placeholder="e.g., Price match policy expired, product not eligible..."
              value={denialReason}
              onChange={(e) => setDenialReason(e.target.value)}
              className="mb-3"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveDenied}>
                Save outcome
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setExpandedAction(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NeedsAttentionSection({ items }: { items: typeof mockDashboardData.needsAttention }) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const getItemId = (item: (typeof items)[number]): string =>
    item.type === "confirm_extraction" ? item.purchaseId : item.claimId;
  const visibleItems = items.filter((item) => !dismissedIds.includes(getItemId(item)));

  const handleDismiss = (id: string) => {
    setDismissedIds([...dismissedIds, id]);
  };

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Needs your attention</h2>
        <p className="text-sm text-neutral-600">
          These items require a decision or update from you.
        </p>
      </div>

      {visibleItems.length === 0 ? (
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleItems.map((item) => {
            if (item.type === "review_draft") {
              return (
                <ReviewDraftCard
                  key={item.claimId}
                  claimId={item.claimId}
                  platform={item.platform}
                  title={item.title}
                  claimType={item.claimType}
                  windowRemaining={item.windowRemaining}
                />
              );
            }
            if (item.type === "confirm_extraction") {
              return (
                <ConfirmExtractionCard
                  key={item.purchaseId}
                  purchaseId={item.purchaseId}
                  platform={item.platform}
                  title={item.title}
                  lowConfidenceFields={item.lowConfidenceFields}
                />
              );
            }
            if (item.type === "update_needed") {
              return (
                <UpdateNeededCard
                  key={item.claimId}
                  claimId={item.claimId}
                  platform={item.platform}
                  title={item.title}
                  submittedDaysAgo={item.submittedDaysAgo}
                  claimType={item.claimType}
                  requestedAmount={item.requestedAmount}
                  onDismiss={() => handleDismiss(item.claimId)}
                />
              );
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

function MonitoredPurchasesSection({
  purchases,
}: {
  purchases: typeof mockDashboardData.monitoredPurchases;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Monitored purchases</h2>
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
      </div>

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
                {purchases.map((purchase) => {
                  const Icon = getCategoryIcon(purchase.category);
                  const isWarning = purchase.status === "window ending soon";

                  return (
                    <tr key={purchase.purchaseId} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                        {purchase.platform}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700">{purchase.title}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs capitalize">
                          <Icon className="w-3 h-3 mr-1" aria-hidden="true" />
                          {purchase.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs capitalize",
                            purchase.status === "monitoring" &&
                              "bg-brand-primary-50 text-brand-primary-700",
                            purchase.status === "claim drafted" &&
                              "bg-neutral-100 text-neutral-700",
                            purchase.status === "submitted" &&
                              "bg-semantic-info-bg text-semantic-info",
                            isWarning && "bg-semantic-warning-bg text-semantic-warning",
                          )}
                        >
                          {purchase.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600">
                        <span className={cn(isWarning && "text-semantic-warning font-medium")}>
                          {purchase.windowRemaining}
                        </span>
                      </td>
                    </tr>
                  );
                })}
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
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const simulateUpload = () => {
    setUploading(true);
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setUploading(false);
            setUploadProgress(0);
            toast.success("Receipt uploaded. We'll extract the purchase details next.");
          }, 300);
          return 100;
        }
        return prev + 20;
      });
    }, 200);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    simulateUpload();
  };

  return (
    <section>
      <Card className="border-neutral-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-neutral-900">Quick upload</CardTitle>
          <CardDescription>Add a receipt without leaving the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <button
            type="button"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={!uploading ? simulateUpload : undefined}
            disabled={uploading}
            className={cn(
              "w-full border-2 border-dashed rounded-lg p-6 text-center transition-colors",
              uploading ? "cursor-default" : "cursor-pointer",
              isDragging
                ? "border-brand-primary-400 bg-brand-primary-50"
                : "border-neutral-300 hover:border-neutral-400",
            )}
          >
            {uploading ? (
              <div className="space-y-3">
                <div className="text-sm text-neutral-600">Uploading...</div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            ) : (
              <>
                <UploadCloud className="w-8 h-8 mx-auto text-neutral-400 mb-2" aria-hidden="true" />
                <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-neutral-300 bg-neutral-0 text-sm font-medium text-neutral-700 mb-2">
                  Browse files
                </span>
                <p className="text-xs text-neutral-500">or drag and drop</p>
              </>
            )}
          </button>

          <p className="text-xs text-neutral-500 mt-3">PDF, PNG, or JPG up to 10 MB.</p>

          {!gmailConnected && (
            <Link
              href="/settings/gmail"
              className="text-xs text-brand-primary-500 hover:text-brand-primary-600 mt-2 inline-block"
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

function RecentActivitySection({
  activities,
}: {
  activities: typeof mockDashboardData.recentActivity;
}) {
  return (
    <section>
      <Card className="border-neutral-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-neutral-900">
            Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="space-y-3">
            {activities.map((activity) => (
              <li key={activity.text} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-neutral-300 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-neutral-700">{activity.text}</span>
                  <span className="text-neutral-500 ml-2">{activity.time}</span>
                </div>
              </li>
            ))}
          </ul>
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

  const { summary, isLoading: isSummaryLoading, error: summaryError } = useDashboardSummary();
  // gmailConnected reads from auth store (AuthInit populates user via getMe()).
  // Previously read from mockDashboardData.gmailConnected, which masked the
  // real backend state — accounts with gmail_integration.connected=true in
  // Mongo were rendering as "not connected" in the dashboard header.
  const gmailConnected = useAuthStore((s) => s.user?.gmail_integration?.connected ?? false);
  const { needsAttention, monitoredPurchases, recentActivity } = mockDashboardData;

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

  const handleUploadClick = () => {
    toast.success("Receipt added to upload queue.");
  };

  const handleBrowseFiles = () => {
    toast.success("Receipt added to upload queue.");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
      <div className="space-y-8">
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
              {summaryError.message} Refresh to try again — the rest of the dashboard is still
              available below.
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

        {userState !== "new" && <NeedsAttentionSection items={needsAttention} />}

        {userState !== "new" && <MonitoredPurchasesSection purchases={monitoredPurchases} />}

        {/* Quick Upload + Recent Activity grid is hidden in the new-user state
            because HeroNewUser already renders an upload CTA at the top —
            otherwise new users see two upload regions on the same page. */}
        {userState !== "new" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <QuickUploadSection gmailConnected={gmailConnected} />
            <RecentActivitySection activities={recentActivity} />
          </div>
        )}
      </div>
    </div>
  );
}
