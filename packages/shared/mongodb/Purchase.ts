import type {
  Category,
  ClaimType,
  IngestionSource,
  ISODateString,
  Platform,
  PurchaseDateBasis,
  PurchaseStatus,
  UUID,
} from "./types";

export interface ExtractionConfidence {
  platform: number;
  price: number;
  overall_min: number;
  order_id?: number | null;
  product_name?: number | null;
  product_id?: number | null;
  price_paid?: number | null;
  member_price_at_purchase?: number | null;
  purchase_date?: number | null;
  member_tier_at_purchase?: number | null;
  variant?: number | null;
  category?: number | null;
}

export interface Purchase {
  _id: UUID;
  updated_at: ISODateString | null;
  user_id: UUID;
  platform: Platform;
  category: Category;
  product_name: string;
  product_id: string;
  product_url: string | null;
  variant: string | null;
  // Category-specific fields. Null for retail; populated for airline/hotel.
  fare_class: string | null;
  room_type: string | null;
  bed_type: string | null;
  rate_type: string | null;
  price_paid: number;
  member_price_at_purchase: number | null;
  non_member_price_at_purchase: number | null;
  currency: "USD";
  purchase_date: ISODateString;
  purchase_date_basis: PurchaseDateBasis;
  window_expires: ISODateString;
  order_id: string;
  member_tier_at_purchase: string | null;
  status: PurchaseStatus;
  claim_type: ClaimType;
  monitoring_cadence_minutes: number;
  last_checked_at: ISODateString | null;
  ingested_at: ISODateString;
  ingestion_source: IngestionSource;
  receipt_storage_url: string | null;
  receipt_hash: string | null;
  extraction_confidence: ExtractionConfidence;
}
