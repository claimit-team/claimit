"use client";

import { Check, Clock, DollarSign, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OutcomeStatus } from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";

interface MarkResultSectionProps {
  onMarkResult: (result: OutcomeStatus, amount?: number, reason?: string) => void;
}

type ExpandedForm = "approved" | "denied" | null;

export function MarkResultSection({ onMarkResult }: MarkResultSectionProps) {
  const [expandedForm, setExpandedForm] = useState<ExpandedForm>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [denialReason, setDenialReason] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (showSuccess) {
      const timer = window.setTimeout(() => setShowSuccess(false), 3000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [showSuccess]);

  const handleApprovedSave = () => {
    const amount = Number.parseFloat(refundAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid refund amount");
      return;
    }
    onMarkResult("approved", amount);
    setSuccessMessage("Saved · You can change this later");
    setShowSuccess(true);
    setExpandedForm(null);
    toast.success("Claim marked as approved");
  };

  const handleDeniedSave = () => {
    onMarkResult("denied", undefined, denialReason || undefined);
    setSuccessMessage("Saved · You can change this later");
    setShowSuccess(true);
    setExpandedForm(null);
    toast.success("Claim marked as denied");
  };

  const handleStillWaiting = () => {
    onMarkResult("no_response");
    setSuccessMessage("Saved · You can change this later");
    setShowSuccess(true);
    toast.success("Status updated");
  };

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center gap-2 border-neutral-200 border-b bg-neutral-50 py-3">
        <Check className="h-4 w-4 text-semantic-success" />
        <span className="text-neutral-700 text-sm">{successMessage}</span>
      </div>
    );
  }

  return (
    <div className="border-neutral-200 border-b bg-neutral-50 px-4 py-3 lg:px-6">
      <div className="flex flex-col gap-3">
        <p className="font-medium text-neutral-700 text-sm">Have you heard back?</p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExpandedForm(expandedForm === "approved" ? null : "approved")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium text-sm transition-colors",
              expandedForm === "approved"
                ? "border-semantic-success bg-semantic-success/10 text-semantic-success"
                : "border-neutral-200 bg-neutral-0 text-neutral-700 hover:bg-neutral-100",
            )}
          >
            <Check className="h-4 w-4" />
            Mark approved
          </button>
          <button
            type="button"
            onClick={() => setExpandedForm(expandedForm === "denied" ? null : "denied")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium text-sm transition-colors",
              expandedForm === "denied"
                ? "border-semantic-danger bg-semantic-danger/10 text-semantic-danger"
                : "border-neutral-200 bg-neutral-0 text-neutral-700 hover:bg-neutral-100",
            )}
          >
            <X className="h-4 w-4" />
            Mark denied
          </button>
          <button
            type="button"
            onClick={handleStillWaiting}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1.5 font-medium text-neutral-700 text-sm transition-colors hover:bg-neutral-100"
          >
            <Clock className="h-4 w-4" />
            Still waiting
          </button>
        </div>

        {expandedForm === "approved" ? (
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-3">
            <div className="relative">
              <DollarSign className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="w-32 pl-8"
              />
            </div>
            <Button type="button" size="sm" onClick={handleApprovedSave}>
              Save
            </Button>
          </div>
        ) : null}

        {expandedForm === "denied" ? (
          <div className="mt-2 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-3">
            <Textarea
              placeholder="Denial reason (optional)"
              value={denialReason}
              onChange={(e) => setDenialReason(e.target.value)}
              className="min-h-20 resize-none"
            />
            <Button type="button" size="sm" className="self-start" onClick={handleDeniedSave}>
              Save
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
