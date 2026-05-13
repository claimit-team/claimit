import type { ISODateString, Platform, PriceSource, UUID } from "./types";

export interface PriceHistory {
  _id: UUID;
  updated_at: ISODateString | null;
  purchase_id: UUID;
  platform: Platform;
  product_id: string;
  price_member: number | null;
  price_non_member: number | null;
  member_tier_required: string | null;
  currency: "USD";
  checked_at: ISODateString;
  source: PriceSource;
  evidence_screenshot_url: string | null;
  raw_response_hash: string | null;
}
