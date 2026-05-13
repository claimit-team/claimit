"use client";

import { Check, Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { mockPlan } from "@/components/settings/settings-mock";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const mockBillingSettingsState = {
  plan: mockPlan,
  isLoading: false,
  mockError: null as string | null,
  invoices: [
    { id: "inv_1", dateLabel: "{date}", amountLabel: "{amount}", status: "Paid" },
    { id: "inv_2", dateLabel: "{date}", amountLabel: "{amount}", status: "Paid" },
    { id: "inv_3", dateLabel: "{date}", amountLabel: "{amount}", status: "Paid" },
  ],
};

const planDetails = {
  free: {
    name: "Free",
    summary: "Basic monitoring features",
    details: "$0 forever · 3 active monitors · alerts only",
  },
  pro: {
    name: "Pro",
    summary: "Full professional features",
    details: "$4.99/month or $49/year",
  },
  family: {
    name: "Family",
    summary: "Family sharing plan",
    details: "$9.99/month or $99/year · up to 5 users",
  },
};

const proFeatures = [
  "Unlimited monitoring",
  "Claim drafting",
  "Gmail integration",
  "Assistant support",
];

export default function BillingPage() {
  const [state] = useState(mockBillingSettingsState);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const handleMockAction = (action: string) => {
    toast.info(`${action} is not connected in this mock flow.`);
  };

  const handleCancelConfirm = () => {
    toast.success("Cancellation confirmed in this mock flow.");
    setCancelDialogOpen(false);
  };

  if (state.isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (state.mockError) {
    return (
      <div className="max-w-3xl">
        <Alert variant="destructive">
          <AlertDescription>Billing settings could not be loaded (mock).</AlertDescription>
        </Alert>
      </div>
    );
  }

  const currentPlan = planDetails[state.plan];
  const isPaidPlan = state.plan === "pro" || state.plan === "family";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Plan and billing</h1>
        <p className="mt-1 text-neutral-700">
          View your current plan and manage billing details (mock UI).
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This screen uses mock placeholders. No real billing system is connected.
        </p>
      </div>

      <Card className="border-neutral-200 bg-neutral-0">
        <CardHeader>
          <CardTitle className="text-neutral-900">Current plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant="secondary"
              className="bg-brand-primary-500/10 text-brand-primary-600 hover:bg-brand-primary-500/10"
            >
              {currentPlan.name}
            </Badge>
            <span className="text-sm text-neutral-700">{currentPlan.summary}</span>
          </div>
          <p className="text-sm text-neutral-700">{currentPlan.details}</p>
          {isPaidPlan ? (
            <p className="text-sm text-muted-foreground">
              Pro and Family include a 30-day free trial for new users (promotion).
            </p>
          ) : null}
        </CardContent>
      </Card>

      {state.plan === "free" ? (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <CardTitle className="text-neutral-900">Upgrade (mock)</CardTitle>
            <CardDescription className="text-neutral-700">What Pro adds:</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-neutral-700">
                  <Check className="size-4 text-brand-primary-500" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => handleMockAction("Upgrade")}
                className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
              >
                Upgrade to Pro
              </Button>
              <Link href="/pricing" className={cn(buttonVariants({ variant: "outline" }))}>
                View pricing
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isPaidPlan ? (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <CardTitle className="text-neutral-900">Payment method (mock)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <span className="text-sm text-neutral-700">Card / bank account</span>
                <span className="text-sm text-muted-foreground">Mock placeholder</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <span className="text-sm text-neutral-700">Billing address</span>
                <span className="text-sm text-muted-foreground">Mock placeholder</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleMockAction("Payment method update")}
              className="border-neutral-200"
            >
              Update payment method
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isPaidPlan ? (
        <Card className="border-neutral-200 bg-neutral-0">
          <CardHeader>
            <CardTitle className="text-neutral-900">Invoice history (mock)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {state.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="text-sm text-neutral-700">
                      Invoice from {invoice.dateLabel} · {invoice.amountLabel}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {invoice.status}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleMockAction("Invoice download")}
                    aria-label="Download invoice"
                  >
                    <Download className="size-4 text-neutral-700" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isPaidPlan ? (
        <div className="pt-4">
          <button
            type="button"
            className="text-sm text-semantic-danger underline-offset-4 hover:underline"
            onClick={() => setCancelDialogOpen(true)}
          >
            Cancel subscription
          </button>

          <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
            <DialogContent className="border-neutral-200 bg-neutral-0">
              <DialogHeader>
                <DialogTitle className="text-neutral-900">Cancel subscription?</DialogTitle>
                <DialogDescription className="text-neutral-700">
                  This is a mock UI. No real subscription will be cancelled.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCancelDialogOpen(false)}
                  className="border-neutral-200"
                >
                  Keep plan
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleCancelConfirm}
                  className="bg-semantic-danger hover:bg-semantic-danger/90"
                >
                  Cancel subscription
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
