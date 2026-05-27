"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PurchasesApiError, updatePurchase } from "@/lib/api/purchases";

interface AddProductUrlDialogProps {
  purchaseId: string;
  platform: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

/**
 * BUG-19 remediation: single-field dialog that sets `product_url` on a
 * monitoring purchase whose adapter is blocked on the missing URL.
 *
 * Validation is intentionally minimal — anything resembling an https URL
 * is accepted client-side; the real check is whether the next monitor
 * sweep can scrape it. A bad URL surfaces as a fresh `last_monitor_error`
 * on the following tick rather than a blocking 400 here, which keeps the
 * remediation flow forgiving.
 */
export function AddProductUrlDialog({
  purchaseId,
  platform,
  open,
  onOpenChange,
  onUpdated,
}: AddProductUrlDialogProps) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmed = url.trim();
  const looksValid = /^https?:\/\/\S+/i.test(trimmed);

  async function handleSubmit() {
    if (!looksValid || submitting) return;
    setSubmitting(true);
    try {
      await updatePurchase(purchaseId, { product_url: trimmed });
      toast.success("Product URL saved. ClaimIt will retry monitoring shortly.");
      onUpdated();
      onOpenChange(false);
      setUrl("");
    } catch (err) {
      const message =
        err instanceof PurchasesApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't save that URL. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Add product URL</DialogTitle>
          <DialogDescription>
            Paste the {platform} product page URL so ClaimIt can monitor the live price.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="product-url-input">Product URL</Label>
          <Input
            id="product-url-input"
            type="url"
            inputMode="url"
            autoFocus
            placeholder="https://www.bestbuy.com/site/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={submitting}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!looksValid || submitting}
            className="bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
          >
            {submitting ? "Saving…" : "Save URL"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
