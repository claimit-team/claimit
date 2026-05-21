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
