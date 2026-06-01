"use client";

import type { Platform } from "@claimit/mongodb-types";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConfirmCategory, ConfirmFormState } from "@/lib/confirm-form-state";
import { PLATFORM_LABELS } from "@/lib/platform-labels";
import { cn } from "@/lib/utils";

/**
 * Editable form for the /confirm page (ticket 5.14 B4).
 *
 * State is LIFTED — every input is a controlled component driven by
 * `state`/`onChange` from `ConfirmPurchaseContent`. The ActionBar
 * reads the same state to build the `corrected_fields` patch on
 * submit; we don't keep a second copy here.
 *
 * Platform Select is now driven by the actual backend `Platform`
 * enum from `@claimit/mongodb-types` rather than the previous
 * hardcoded 27-label list. This guarantees every submittable value
 * passes the backend's `_ALLOWED_CORRECTABLE_FIELDS` →
 * `Platform.model_validate` step on /confirm.
 *
 * LATENT DATA MISMATCH (flagged, not fixed in 5.14): the Platform
 * enum carries 10 values but 26 platforms have seeded policies
 * (e.g. costco, hyatt, jetblue, home_depot). Until the enum is
 * widened in a follow-up ticket, users uploading a Costco receipt
 * arrive on this page with platform="" and must pick one of the
 * available 10 — typically "Other" once that's added, but for now
 * the closest match. Widening the enum will surface the additional
 * options here automatically (no FE change required).
 */

const PLATFORM_OPTIONS: ReadonlyArray<{ value: Platform; label: string }> = (
  Object.entries(PLATFORM_LABELS) as Array<[Platform, string]>
).map(([value, label]) => ({ value, label }));

export interface ExtractionReviewFormProps {
  state: ConfirmFormState;
  onChange: (next: ConfirmFormState) => void;
  /**
   * Form-field names (NOT confidence keys) the banner flagged as
   * low-confidence. We apply an italic "Verify this — we weren't
   * sure" placeholder on those inputs.
   */
  lowConfidenceFields: ReadonlyArray<string>;
  /** Disable every input while a confirm is in flight. */
  disabled?: boolean;
}

export function ExtractionReviewForm({
  state,
  onChange,
  lowConfidenceFields,
  disabled = false,
}: ExtractionReviewFormProps) {
  // Auto-open Additional details on mount when product_url needs the
  // user's attention: either the extractor flagged it low-confidence, or
  // the field is empty for a platform whose scrape adapter hard-requires
  // it (best_buy / target — see apps/monitor-agent adapter guards). This
  // is a one-shot initializer (lazy `useState`); subsequent renders
  // respect the user's manual open/close.
  const [isAdditionalOpen, setIsAdditionalOpen] = useState(() => {
    if (lowConfidenceFields.includes("product_url")) return true;
    const scrapeRequiresUrl = state.platform === "best_buy" || state.platform === "target";
    if (scrapeRequiresUrl && !state.productUrl.trim()) return true;
    return false;
  });
  const isLow = (field: string) => lowConfidenceFields.includes(field);
  const lowPlaceholder = (field: string, base: string) =>
    isLow(field) ? "Verify this — we weren't sure" : base;
  const update = (patch: Partial<ConfirmFormState>) => onChange({ ...state, ...patch });

  // Product-URL "searching" affordance: for the scrape-backed platforms
  // (best_buy / target) the monitor-agent resolves a product link async after
  // confirm and notifies via the bell. While the field is blank we show a
  // live "we're searching…" state so the user knows it's handled and the URL
  // is optional. Hidden once they type a link or for non-scraped platforms.
  const resolvable = state.platform === "best_buy" || state.platform === "target";
  const searchingProductUrl = resolvable && !state.productUrl.trim();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="platform" className="text-sm font-medium text-neutral-700">
          Platform
        </Label>
        <Select
          value={state.platform === "" ? undefined : state.platform}
          onValueChange={(value: string | null) =>
            update({ platform: value === null ? "" : (value as Platform) })
          }
          disabled={disabled}
        >
          <SelectTrigger id="platform" className="w-full min-w-0">
            <SelectValue placeholder="Select platform">
              {(value: Platform | "") => (value === "" ? null : PLATFORM_LABELS[value as Platform])}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[min(320px,var(--spacing)*80)] overflow-y-auto">
            {PLATFORM_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="productName" className="text-sm font-medium text-neutral-700">
          Product / item name
        </Label>
        <Input
          id="productName"
          value={state.productName}
          onChange={(e) => update({ productName: e.target.value })}
          placeholder={lowPlaceholder("product_name", "Enter product name")}
          className={cn(isLow("product_name") && "placeholder:italic placeholder:text-neutral-400")}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pricePaid" className="text-sm font-medium text-neutral-700">
          Purchase price
        </Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
            $
          </span>
          <Input
            id="pricePaid"
            type="number"
            step="0.01"
            min={0}
            value={state.pricePaid}
            onChange={(e) => update({ pricePaid: e.target.value })}
            placeholder={lowPlaceholder("price_paid", "0.00")}
            className={cn(
              "pl-7",
              isLow("price_paid") && "placeholder:italic placeholder:text-neutral-400",
            )}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-700">Purchase date</Label>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !state.purchaseDate && "text-muted-foreground",
                )}
              />
            }
          >
            <CalendarIcon className="mr-2 size-4" aria-hidden />
            {state.purchaseDate ? (
              format(state.purchaseDate, "PPP")
            ) : (
              <span className={isLow("purchase_date") ? "italic" : ""}>
                {isLow("purchase_date") ? "Verify this — we weren't sure" : "Pick a date"}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden border border-neutral-200 p-0 shadow-md"
            align="start"
          >
            <Calendar
              mode="single"
              selected={state.purchaseDate ?? undefined}
              onSelect={(date) => update({ purchaseDate: date ?? null })}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label htmlFor="orderId" className="text-sm font-medium text-neutral-700">
          Order ID / confirmation number
        </Label>
        <Input
          id="orderId"
          value={state.orderId}
          onChange={(e) => update({ orderId: e.target.value })}
          placeholder={lowPlaceholder("order_id", "Enter order ID")}
          className={cn(isLow("order_id") && "placeholder:italic placeholder:text-neutral-400")}
          disabled={disabled}
        />
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium text-neutral-700">Category</Label>
        <RadioGroup
          value={state.category}
          onValueChange={(v) => update({ category: (v ?? "retail") as ConfirmCategory })}
          disabled={disabled}
          className="flex flex-wrap gap-4"
        >
          {(["retail", "airline", "hotel"] as const).map((cat) => (
            <div key={cat} className="flex items-center gap-2">
              <RadioGroupItem value={cat} id={`cat-${cat}`} />
              <Label
                htmlFor={`cat-${cat}`}
                className="text-sm font-normal text-neutral-700 cursor-pointer"
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <Collapsible open={isAdditionalOpen} onOpenChange={setIsAdditionalOpen}>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              type="button"
              className="w-full justify-between px-0 hover:bg-transparent"
            />
          }
        >
          <span className="text-sm font-medium text-neutral-700">Additional details</span>
          <ChevronDown
            className={cn(
              "size-4 text-neutral-500 transition-transform shrink-0",
              isAdditionalOpen && "rotate-180",
            )}
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="memberTier" className="text-sm font-medium text-neutral-700">
              Member tier
            </Label>
            <Input
              id="memberTier"
              value={state.memberTier}
              onChange={(e) => update({ memberTier: e.target.value })}
              placeholder="e.g., Gold, Platinum"
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="productUrl" className="text-sm font-medium text-neutral-700">
              Product URL
            </Label>
            <Input
              id="productUrl"
              type="url"
              value={state.productUrl}
              onChange={(e) => update({ productUrl: e.target.value })}
              placeholder={lowPlaceholder(
                "product_url",
                state.platform === "target"
                  ? "https://www.target.com/p/..."
                  : "https://www.bestbuy.com/site/...",
              )}
              className={cn(
                isLow("product_url") && "placeholder:italic placeholder:text-neutral-400",
              )}
              disabled={disabled}
            />
            {searchingProductUrl && (
              <div className="flex items-start gap-2 text-xs text-neutral-500" aria-live="polite">
                <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" aria-hidden />
                <span>
                  We&apos;re finding your {PLATFORM_LABELS[state.platform]} product link —
                  we&apos;ll notify you once it&apos;s ready.
                  <span className="block text-neutral-400">
                    Know the link? Paste it above to skip the wait.
                  </span>
                </span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
