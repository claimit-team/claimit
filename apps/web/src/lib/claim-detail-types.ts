/** Claim detail domain (Batch 6) — aligns with v0 claim detail views. */

export type ClaimDetailWorkflowStatus =
  | "awaiting_approval"
  | "queued_for_send"
  | "ready_to_execute"
  | "submitted"
  | "approved"
  | "denied"
  | "expired";

export type ClaimDetailDraftType =
  | "email"
  | "chat_script"
  | "in_store_guide"
  | "self_service_walkthrough";

export type OutcomeStatus = "approved" | "denied" | "no_response" | null;

export interface DraftVersion {
  version: number;
  content: string;
  created_at: string;
}

export interface ClaimEvidence {
  current_price: number;
  original_price: number;
  screenshot_url: string;
  captured_at: string;
  policy_clause: string;
  policy_url: string;
}

export interface ClaimPurchase {
  purchase_id: string;
  purchase_date: string;
  order_id: string;
  price_paid: number;
}

export interface ClaimDetail {
  claim_id: string;
  status: ClaimDetailWorkflowStatus;
  claim_type: ClaimDetailDraftType;
  platform: string;
  product_name: string;
  refund_amount: number;
  currency: string;
  window_remaining_hours: number;
  draft_versions: DraftVersion[];
  current_version: number;
  evidence: ClaimEvidence;
  purchase: ClaimPurchase;
  outcome?: OutcomeStatus;
  outcome_amount?: number;
  denial_reason?: string;
}

export interface ClaimMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  tool_summary?: string;
}

export interface ClaimConversation {
  conversation_id: string;
  claim_id: string;
  messages: ClaimMessage[];
}
