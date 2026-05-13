import type {
  ClaimOutcome,
  ClaimType,
  DenialReason,
  DraftGeneratedBy,
  ISODateString,
  Platform,
  SendMode,
  SubmittedVia,
  UUID,
} from "./types";

export interface DraftVersion {
  version: number;
  content: string;
  generated_by: DraftGeneratedBy;
  at: ISODateString;
}

/**
 * Invariant: `draft_content` always equals `draft_versions[draft_versions.length - 1].content`.
 * Kept as a top-level field for query convenience. Any update must keep both in sync.
 */
export interface Claim {
  _id: UUID;
  updated_at: ISODateString | null;
  purchase_id: UUID;
  user_id: UUID;
  platform: Platform;
  claim_amount: number;
  currency: "USD";
  claim_type: ClaimType;
  draft_content: string;
  draft_versions: DraftVersion[];
  redraft_count: number;
  policy_clause_cited: string;
  evidence_screenshot_url: string | null;
  send_override: SendMode | null;
  submitted_at: ISODateString | null;
  submitted_via: SubmittedVia | null;
  outcome: ClaimOutcome;
  outcome_note: string | null;
  denial_reason_extracted: DenialReason | null;
  resolved_at: ISODateString | null;
  trace_id: string | null;
}
