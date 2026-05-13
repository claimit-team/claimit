import type { PriceSource } from "./types";

export interface PriceHistory {
  _id: string;
  purchase_id: string;
  platform: string;
  product_id: string;
  price_member: number | null;
  price_non_member: number | null;
  member_tier_required: string | null;
  currency: string;
  checked_at: string;
  source: PriceSource;
  evidence_screenshot_url: string | null;
  raw_response_hash: string | null;
}
