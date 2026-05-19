export type NotificationEventType =
  | "price_dropped"
  | "claim_drafted"
  | "claim_queued_auto"
  | "claim_submitted"
  | "claim_denied"
  | "claim_resolved_success"
  | "low_confidence_extract"
  | "first_time_dashboard"
  | "user_returned_after_long_absence"
  | "consecutive_rejections";

export type NotificationEntityType = "purchase" | "claim" | "conversation";

export type NotificationEvent = {
  _id: string;
  updated_at: string | null;
  user_id: string;
  event_type: NotificationEventType;
  entity_type: NotificationEntityType | null;
  entity_id: string | null;
  data: Record<string, unknown>;
  acknowledged: boolean;
  acknowledged_at: string | null;
  surfaced_at: string | null;
  created_at: string;
};
