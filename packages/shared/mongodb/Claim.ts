import type {
  ClaimOutcome,
  ClaimType,
  DenialReason,
  DraftGeneratedBy,
  SendMode,
  SubmittedVia,
} from "./types";

export interface DraftVersion {
  version: number;
  content: string;
  generated_by: DraftGeneratedBy;
  at: string;
}

export interface Claim {
  _id: string;
  purchase_id: string;
  user_id: string;
  platform: string;
  claim_amount: number;
  currency: string;
  claim_type: ClaimType;
  draft_content: string;
  draft_versions: DraftVersion[];
  redraft_count: number;
  policy_clause_cited: string;
  evidence_screenshot_url: string | null;
  send_override: SendMode | null;
  submitted_at: string | null;
  submitted_via: SubmittedVia | null;
  outcome: ClaimOutcome;
  outcome_note: string | null;
  denial_reason_extracted: DenialReason | null;
  resolved_at: string | null;
  trace_id: string | null;
}
