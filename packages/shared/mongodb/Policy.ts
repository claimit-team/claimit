import type { Category, ClaimType } from "./types";

export interface Policy {
  _id: string;
  platform: string;
  category: Category;
  window_days: number;
  window_days_member: number | null;
  pre_arrival_hours_required: number | null;
  covers_own_drops: boolean;
  covers_competitor_drops: boolean;
  claim_type: ClaimType;
  claim_url: string | null;
  claim_email: string | null;
  claim_phone: string | null;
  loyalty_required: boolean;
  award_ticket_eligible: boolean | null;
  bundle_exclusions: boolean;
  key_exclusions: string[];
  policy_url: string;
  policy_text_full: string;
  policy_text_relevant_clause: string;
  last_verified: string;
  active: boolean;
}
