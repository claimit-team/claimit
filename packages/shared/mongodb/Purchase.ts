import type {
  Category,
  ClaimType,
  IngestionSource,
  PurchaseDateBasis,
  PurchaseStatus,
} from "./types";

export interface ExtractionConfidence {
  platform: number;
  price: number;
  overall_min: number;
}

export interface Purchase {
  _id: string;
  user_id: string;
  platform: string;
  category: Category;
  product_name: string;
  product_id: string;
  product_url: string | null;
  variant: string | null;
  fare_class: string | null;
  room_type: string | null;
  bed_type: string | null;
  rate_type: string | null;
  price_paid: number;
  member_price_at_purchase: number | null;
  non_member_price_at_purchase: number | null;
  currency: string;
  purchase_date: string;
  purchase_date_basis: PurchaseDateBasis;
  window_expires: string;
  order_id: string;
  member_tier_at_purchase: string | null;
  status: PurchaseStatus;
  claim_type: ClaimType;
  monitoring_cadence_minutes: number;
  ingested_at: string;
  ingestion_source: IngestionSource;
  receipt_storage_url: string | null;
  receipt_hash: string | null;
  extraction_confidence: ExtractionConfidence;
}
