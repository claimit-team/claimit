import type { SendMode, SubscriptionTier } from "./types";

export interface DefaultLocation {
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export interface LoyaltyMembership {
  platform: string;
  member_id: string;
  tier: string;
}

export interface GmailIntegration {
  connected: boolean;
  connected_at: string | null;
  scopes_granted: string[];
  refresh_token_ref: string | null;
  watch_history_id: string | null;
  watch_expires_at: string | null;
  last_processed_message_id: string | null;
}

export interface SendPreference {
  default_mode: SendMode;
  auto_send_delay_seconds: number;
  changed_at: string | null;
}

export interface IngestionSkiplistEntry {
  sender: string;
  format_hash: string;
  added_at: string;
  reason: string;
}

export interface NotificationPrefs {
  web_push: boolean;
  email: boolean;
}

export interface Subscription {
  tier: SubscriptionTier;
  trial_ends: string | null;
  renewed_at: string | null;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  default_location: DefaultLocation;
  loyalty_memberships: LoyaltyMembership[];
  gmail_integration: GmailIntegration;
  send_preference: SendPreference;
  ingestion_skiplist: IngestionSkiplistEntry[];
  notification_prefs: NotificationPrefs;
  subscription: Subscription;
  created_at: string;
}
