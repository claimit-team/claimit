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

export type SelfEvalScore = {
  clarity: number;
  tone: number;
  accuracy: number;
  completeness: number;
};

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
  /** Actual refund recovered; null until an approved outcome is recorded. */
  reclaimed_amount: number | null;
  currency: "USD";
  claim_type: ClaimType;
  draft_content: string;
  draft_versions: DraftVersion[];
  redraft_count: number;
  policy_clause_cited: string;
  evidence_screenshot_url: string | null;
  send_override: SendMode | null;
  auto_send_at: ISODateString | null;
  /**
   * LLM-generated subject + platform CS address resolved at draft time.
   * Persisted so the send phase doesn't have to re-run the LLM or
   * re-resolve policy. Null on non-EMAIL claim_types.
   */
  subject: string | null;
  recipient_email: string | null;
  gmail_message_id: string | null;
  submitted_at: ISODateString | null;
  submitted_via: SubmittedVia | null;
  outcome: ClaimOutcome;
  outcome_note: string | null;
  denial_reason_extracted: DenialReason | null;
  resolved_at: ISODateString | null;
  trace_id: string | null;
  self_eval_score: SelfEvalScore | null;
  self_eval_attempts: number;
}
