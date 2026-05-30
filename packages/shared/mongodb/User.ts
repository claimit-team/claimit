import type { NotificationEventType } from "./NotificationEvent";
import type {
  ISODateString,
  LoyaltyTier,
  Platform,
  SendMode,
  SubscriptionTier,
  UUID,
} from "./types";

export interface DefaultLocation {
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export interface LoyaltyMembership {
  platform: Platform;
  member_id: string;
  tier: LoyaltyTier;
}

export interface GmailIntegration {
  connected: boolean;
  connected_at: ISODateString | null;
  connected_email: string | null;
  scopes_granted: string[];
  refresh_token_ref: string | null;
  watch_history_id: string | null;
  watch_expires_at: ISODateString | null;
  last_processed_message_id: string | null;
}

export interface SendPreference {
  default_mode: SendMode;
  auto_send_delay_seconds: number;
  changed_at: ISODateString | null;
}

export interface IngestionSkiplistEntry {
  sender: string;
  format_hash: string;
  added_at: ISODateString;
  reason: string;
}

export interface NotificationPrefs {
  web_push: boolean;
  email: boolean;
  muted_event_types: NotificationEventType[];
}

export interface Subscription {
  tier: SubscriptionTier;
  trial_ends: ISODateString | null;
  renewed_at: ISODateString | null;
}

export interface User {
  _id: UUID;
  updated_at: ISODateString | null;
  email: string;
  name: string;
  provider_avatar_url: string | null;
  custom_avatar_url: string | null;
  default_location: DefaultLocation;
  loyalty_memberships: LoyaltyMembership[];
  gmail_integration: GmailIntegration;
  send_preference: SendPreference;
  ingestion_skiplist: IngestionSkiplistEntry[];
  notification_prefs: NotificationPrefs;
  subscription: Subscription;
  onboarded: boolean;
  created_at: ISODateString;
}
