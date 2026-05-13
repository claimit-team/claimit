"use client";

import { format } from "date-fns";
import { CalendarIcon, ChevronDown } from "lucide-react";
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
import type { ExtractionField, PurchaseCategory } from "@/lib/mock-purchases";
import { cn } from "@/lib/utils";

const SUPPORTED_PLATFORMS = [
  "Amazon",
  "Best Buy",
  "Costco",
  "Dell",
  "Target",
  "Walmart",
  "Home Depot",
  "Lowes",
  "Apple",
  "Microsoft",
  "Samsung",
  "Hilton",
  "Marriott",
  "Hyatt",
  "IHG",
  "Southwest",
  "Delta",
  "United",
  "American Airlines",
  "JetBlue",
  "Alaska Airlines",
  "Expedia",
  "Booking.com",
  "Airbnb",
  "Vrbo",
  "Kayak",
  "Other",
] as const;

interface FormShape {
  platform: string;
  productName: string;
  pricePaid: number | string;
  purchaseDate: Date | undefined;
  orderId: string;
  category: PurchaseCategory;
  memberTier: string;
  roomTypeOrCabin: string;
  bookingDates: string;
  rateTypeOrPromo: string;
}

export interface ExtractionReviewFormProps {
  initialData: {
    platform: ExtractionField<string>;
    product_name: ExtractionField<string>;
    price_paid: ExtractionField<number>;
    purchase_date: ExtractionField<string>;
    order_id: ExtractionField<string>;
    category: PurchaseCategory;
  };
  lowConfidenceFields: string[];
}

export function ExtractionReviewForm({
  initialData,
  lowConfidenceFields,
}: ExtractionReviewFormProps) {
  const [formData, setFormData] = useState<FormShape>({
    platform: initialData.platform.value || "Other",
    productName: initialData.product_name.value,
    pricePaid: initialData.price_paid.value,
    purchaseDate: initialData.purchase_date.value
      ? new Date(initialData.purchase_date.value)
      : undefined,
    orderId: initialData.order_id.value,
    category: initialData.category,
    memberTier: "",
    roomTypeOrCabin: "",
    bookingDates: "",
    rateTypeOrPromo: "",
  });

  const [isAdditionalOpen, setIsAdditionalOpen] = useState(false);

  const isLowConfidence = (field: string) => lowConfidenceFields.includes(field);

  const getLowConfidencePlaceholder = (field: string, defaultPlaceholder: string) =>
    isLowConfidence(field) ? "Verify this — we weren't sure" : defaultPlaceholder;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="platform" className="text-sm font-medium text-neutral-700">
          Platform
        </Label>
        <Select
          value={formData.platform}
          onValueChange={(value: string | null) =>
            setFormData((prev) => ({ ...prev, platform: value ?? "Other" }))
          }
        >
          <SelectTrigger id="platform" className="w-full min-w-0">
            <SelectValue placeholder="Select platform" />
          </SelectTrigger>
          <SelectContent className="max-h-[min(320px,var(--spacing)*80)] overflow-y-auto">
            {SUPPORTED_PLATFORMS.map((platform) => (
              <SelectItem key={platform} value={platform}>
                {platform}
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
          value={formData.productName}
          onChange={(e) => setFormData((prev) => ({ ...prev, productName: e.target.value }))}
          placeholder={getLowConfidencePlaceholder("product_name", "Enter product name")}
          className={
            isLowConfidence("product_name")
              ? "placeholder:italic placeholder:text-neutral-400"
              : undefined
          }
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
            value={formData.pricePaid}
            onChange={(e) => setFormData((prev) => ({ ...prev, pricePaid: e.target.value }))}
            placeholder={getLowConfidencePlaceholder("price_paid", "0.00")}
            className={cn(
              "pl-7",
              isLowConfidence("price_paid")
                ? "placeholder:italic placeholder:text-neutral-400"
                : "",
            )}
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
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !formData.purchaseDate && "text-muted-foreground",
                )}
              />
            }
          >
            <CalendarIcon className="mr-2 size-4" aria-hidden />
            {formData.purchaseDate ? (
              format(formData.purchaseDate, "PPP")
            ) : (
              <span className={isLowConfidence("purchase_date") ? "italic" : ""}>
                {isLowConfidence("purchase_date") ? "Verify this — we weren't sure" : "Pick a date"}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden border border-neutral-200 p-0 shadow-md"
            align="start"
          >
            <Calendar
              mode="single"
              selected={formData.purchaseDate}
              onSelect={(date) =>
                setFormData((prev) => ({ ...prev, purchaseDate: date ?? undefined }))
              }
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
          value={formData.orderId}
          onChange={(e) => setFormData((prev) => ({ ...prev, orderId: e.target.value }))}
          placeholder={getLowConfidencePlaceholder("order_id", "Enter order ID")}
          className={
            isLowConfidence("order_id") ? "placeholder:italic placeholder:text-neutral-400" : ""
          }
        />
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium text-neutral-700">Category</Label>
        <RadioGroup
          value={formData.category}
          onValueChange={(v) =>
            setFormData((prev) => ({
              ...prev,
              category: (v ?? "retail") as PurchaseCategory,
            }))
          }
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
              value={formData.memberTier}
              onChange={(e) => setFormData((prev) => ({ ...prev, memberTier: e.target.value }))}
              placeholder="e.g., Gold, Platinum"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="roomTypeOrCabin" className="text-sm font-medium text-neutral-700">
              {formData.category === "hotel"
                ? "Room type"
                : formData.category === "airline"
                  ? "Cabin class"
                  : "Room type / Cabin class"}
            </Label>
            <Input
              id="roomTypeOrCabin"
              value={formData.roomTypeOrCabin}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, roomTypeOrCabin: e.target.value }))
              }
              placeholder={
                formData.category === "hotel" ? "e.g., Deluxe King" : "e.g., Economy, Business"
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookingDates" className="text-sm font-medium text-neutral-700">
              Booking dates
            </Label>
            <Input
              id="bookingDates"
              value={formData.bookingDates}
              onChange={(e) => setFormData((prev) => ({ ...prev, bookingDates: e.target.value }))}
              placeholder="e.g., May 15-18, 2026"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rateTypeOrPromo" className="text-sm font-medium text-neutral-700">
              Rate type / promotional code
            </Label>
            <Input
              id="rateTypeOrPromo"
              value={formData.rateTypeOrPromo}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, rateTypeOrPromo: e.target.value }))
              }
              placeholder="e.g., AAA Rate, SUMMER20"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
