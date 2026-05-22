# ClaimIt Pub/Sub topics.
#
# Twelve topics total: six main topics (business events) plus six matching
# .dlq dead-letter topics for failed redelivery.
#
# Intentionally NOT in this file:
#   - Subscriptions — created in feature tickets alongside their consumers,
#     with `dead_letter_policy { dead_letter_topic = ... }` wiring the DLQ.
#   - Per-agent producer IAM (roles/pubsub.publisher) — also deferred to the
#     feature tickets that introduce each producer.
#
# Provider / required_providers / var.project_id / var.region all live in the
# sibling files (versions.tf, variables.tf, main.tf) and are reused here.

data "google_project" "current" {
  project_id = var.project_id
}

locals {
  main_topic_names = [
    "purchase.uploaded", # ticket 5.14 — api-gateway publishes after a user upload, ingest-agent extracts.
    "purchase.ingested",
    "price.dropped",
    "claim.drafted",
    "claim.approved",
    "claim.resolved",
    "claim.redraft_requested",
  ]

  dlq_topic_names = [for name in local.main_topic_names : "${name}.dlq"]

  # Pub/Sub service agent. Auto-created by GCP when the Pub/Sub API is enabled;
  # IAM grants referencing it succeed even before the SA is materialized.
  pubsub_service_agent = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# ---------- Main topics ----------
resource "google_pubsub_topic" "main" {
  for_each = toset(local.main_topic_names)

  name                       = each.value
  project                    = var.project_id
  message_retention_duration = "604800s" # 7 days
}

# ---------- DLQ topics ----------
resource "google_pubsub_topic" "dlq" {
  for_each = toset(local.dlq_topic_names)

  name                       = each.value
  project                    = var.project_id
  message_retention_duration = "604800s" # 7 days
}

# ---------- Pub/Sub service agent IAM for dead-letter forwarding ----------
# - publisher on DLQ: lets Pub/Sub deliver failed messages into the DLQ topic.
# - subscriber on source subscription: must be granted when each subscription
#   is created (subscription-level IAM, not topic-level). Deferred to feature tickets.

resource "google_pubsub_topic_iam_member" "service_agent_publisher_on_dlq" {
  for_each = google_pubsub_topic.dlq

  project = var.project_id
  topic   = each.value.name
  role    = "roles/pubsub.publisher"
  member  = local.pubsub_service_agent
}

# ---------- Gmail watch inbound (ticket 4.15) ----------
# Not part of `main_topic_names` because:
#   - Publisher is Google's Gmail service agent (gmail-api-push@system),
#     not a ClaimIt-side service — needs its own IAM grant.
#   - Payload shape is Google-defined ({emailAddress, historyId}), not one
#     of our claimit-pubsub event models.
#   - Naming convention differs (hyphen + category, not noun.past-tense).
#
# The DLQ stores messages the ingest-agent push subscription fails to ack
# after `max_delivery_attempts`. Nothing currently consumes it; Cloud
# Logging alerts on DLQ depth are tracked as a follow-up.
resource "google_pubsub_topic" "gmail_inbound" {
  name                       = "gmail-inbound"
  project                    = var.project_id
  message_retention_duration = "604800s" # 7 days
}

resource "google_pubsub_topic" "gmail_inbound_dlq" {
  name                       = "gmail-inbound.dlq"
  project                    = var.project_id
  message_retention_duration = "604800s" # 7 days
}

# Gmail's push service agent (system-managed identity) needs publisher on
# our topic so `users.watch` can deliver notifications. The SA name is
# fixed by Google: gmail-api-push@system.gserviceaccount.com. IAM grants
# to system-managed SAs succeed before the SA materializes; Google
# auto-creates the identity on first publish.
resource "google_pubsub_topic_iam_member" "gmail_push_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.gmail_inbound.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:gmail-api-push@system.gserviceaccount.com"
}

# Pub/Sub service agent → publisher on the gmail-inbound DLQ (matches the
# pattern for the main DLQ topics above; needed for dead-letter forwarding).
resource "google_pubsub_topic_iam_member" "service_agent_publisher_on_gmail_inbound_dlq" {
  project = var.project_id
  topic   = google_pubsub_topic.gmail_inbound_dlq.name
  role    = "roles/pubsub.publisher"
  member  = local.pubsub_service_agent
}

# ---------- Producer publisher IAM (additive google_pubsub_topic_iam_member) ----------
# Each binding grants roles/pubsub.publisher to the Cloud Run service account
# that publishes to that topic. Additive only — safe alongside manual gcloud
# grants already in prod. Do NOT use *_iam_binding / *_iam_policy (authoritative).
#
# Ticket 5.14: api-gateway → purchase.uploaded (receipt upload path).
resource "google_pubsub_topic_iam_member" "api_gateway_publisher_on_purchase_uploaded" {
  project = var.project_id
  topic   = google_pubsub_topic.main["purchase.uploaded"].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${module.api_gateway.service_account_email}"
}

# Ticket 5.8/5.15 prod fix: api-gateway → claim.approved (approve / Send-now).
# Without this binding, approve_claim publish() 403s → 502/503 in prod.
resource "google_pubsub_topic_iam_member" "api_gateway_publisher_on_claim_approved" {
  project = var.project_id
  topic   = google_pubsub_topic.main["claim.approved"].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${module.api_gateway.service_account_email}"
}

# Ticket 5.8/5.15 prod fix: claim-agent → claim.approved (auto-send worker path).
resource "google_pubsub_topic_iam_member" "claim_agent_publisher_on_claim_approved" {
  project = var.project_id
  topic   = google_pubsub_topic.main["claim.approved"].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${module.claim_agent.service_account_email}"
}

# claim-agent → claim.drafted (send_mode approval/auto paths after price drop).
resource "google_pubsub_topic_iam_member" "claim_agent_publisher_on_claim_drafted" {
  project = var.project_id
  topic   = google_pubsub_topic.main["claim.drafted"].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${module.claim_agent.service_account_email}"
}

# ingest-agent → purchase.ingested (finalize after extraction). Unblocks the
# ingest→monitor→claim live pipeline beyond the 5.8/5.15 approve path.
resource "google_pubsub_topic_iam_member" "ingest_agent_publisher_on_purchase_ingested" {
  project = var.project_id
  topic   = google_pubsub_topic.main["purchase.ingested"].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${module.ingest_agent.service_account_email}"
}

# monitor-agent → price.dropped (cron price polling). Unblocks the full
# ingest→monitor→claim pipeline when a drop triggers claim drafting.
resource "google_pubsub_topic_iam_member" "monitor_agent_publisher_on_price_dropped" {
  project = var.project_id
  topic   = google_pubsub_topic.main["price.dropped"].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${module.monitor_agent.service_account_email}"
}

# Ticket 5.9: assistant-agent Mode B request_redraft → claim.redraft_requested.
resource "google_pubsub_topic_iam_member" "assistant_agent_publisher_on_claim_redraft_requested" {
  project = var.project_id
  topic   = google_pubsub_topic.main["claim.redraft_requested"].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${module.assistant_agent.service_account_email}"
}
