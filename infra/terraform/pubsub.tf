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
