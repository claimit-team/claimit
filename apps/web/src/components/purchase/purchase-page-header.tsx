"use client";

import { ArrowLeft, ChevronDown, StopCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatPurchaseDate,
  type PurchaseCategory,
  type PurchaseDetailMonitoringStatus,
} from "@/lib/mock-purchases";
import { cn } from "@/lib/utils";

export interface PurchasePageHeaderModel {
  productTitle: string;
  monitoringStatus: PurchaseDetailMonitoringStatus;
  platform: string;
  category: PurchaseCategory;
  purchaseDate: string;
  orderId: string;
  primaryRelatedClaimId?: string;
}

interface PurchasePageHeaderProps {
  purchase: PurchasePageHeaderModel;
  onMonitoringStatusChange: (next: PurchaseDetailMonitoringStatus) => void;
}

function monitoringBadge(status: PurchaseDetailMonitoringStatus) {
  const config: Record<PurchaseDetailMonitoringStatus, { label: string; className: string }> = {
    monitoring: {
      label: "Monitoring",
      className: "bg-brand-primary-500/10 text-brand-primary-500 border-brand-primary-500/20",
    },
    eligible_drop: {
      label: "Eligible drop",
      className: "bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20",
    },
    claim_active: {
      label: "Claim active",
      className: "bg-brand-primary-500/10 text-brand-primary-500 border-brand-primary-500/20",
    },
    claim_resolved: {
      label: "Refund received",
      className: "bg-semantic-success/10 text-semantic-success border-semantic-success/20",
    },
    window_expired: {
      label: "Window expired",
      className: "bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20",
    },
    stopped: {
      label: "Stopped",
      className: "bg-neutral-100 text-neutral-500 border-neutral-200",
    },
  };
  return config[status];
}

export function PurchasePageHeader({
  purchase,
  onMonitoringStatusChange,
}: PurchasePageHeaderProps) {
  const router = useRouter();
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  const statusBadge = monitoringBadge(purchase.monitoringStatus);

  const handleStopMonitoring = () => {
    onMonitoringStatusChange("stopped");
    setStopDialogOpen(false);
    router.push("/purchases");
  };

  const primaryClaimHref = `/claims/${purchase.primaryRelatedClaimId ?? "new"}`;

  const renderActions = () => {
    switch (purchase.monitoringStatus) {
      case "monitoring":
        return (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ghost" size="sm" onClick={() => setStopDialogOpen(true)}>
              <StopCircle className="size-4" />
              Stop monitoring
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
              >
                <Upload className="size-4" />
                Re-upload receipt
                <ChevronDown className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Upload new receipt</DropdownMenuItem>
                <DropdownMenuItem>Connect via email</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );

      case "eligible_drop":
        return (
          <Link
            href={primaryClaimHref}
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5 px-2.5")}
          >
            View draft claim
          </Link>
        );

      case "claim_active":
      case "claim_resolved":
        return (
          <Link
            href={primaryClaimHref}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            View claim
          </Link>
        );

      case "window_expired":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Upload className="size-4" />
              Re-upload
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Upload new receipt</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );

      case "stopped":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Upload className="size-4" />
              Re-upload receipt
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Upload new receipt</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/purchases"
            aria-label="Back to purchases"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8 shrink-0")}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-2 text-neutral-500 text-sm"
          >
            <Link href="/purchases" className="shrink-0 hover:text-neutral-900">
              Purchases
            </Link>
            <span aria-hidden className="shrink-0">
              /
            </span>
            <span className="truncate font-medium text-neutral-900">{purchase.productTitle}</span>
          </nav>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-semibold text-2xl text-neutral-900">{purchase.productTitle}</h1>
              <Badge variant="outline" className={cn("shrink-0", statusBadge.className)}>
                {statusBadge.label}
              </Badge>
            </div>
            <p className="text-neutral-500 text-sm">
              {purchase.platform} ·{" "}
              {`${purchase.category.charAt(0).toUpperCase()}${purchase.category.slice(1)}`} ·
              Purchased {formatPurchaseDate(purchase.purchaseDate)} · Order {purchase.orderId}
            </p>
          </div>

          <div className="shrink-0">{renderActions()}</div>
        </div>
      </div>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop monitoring</DialogTitle>
            <DialogDescription>
              You won&apos;t be alerted to future price changes. You can always re-upload the
              receipt later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStopDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleStopMonitoring}>
              Stop monitoring
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
