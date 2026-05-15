# ClaimIt Pub/Sub push subscriptions.
#
# Seven push subscriptions fan business events from the topics in pubsub.tf out
# to their consumers (Cloud Run agents + the Vercel-hosted web frontend).
#
# Each subscription has:
#   - OIDC-authenticated push using a dedicated `pubsub-pusher` service account
#   - Dead-letter policy targeting the matching .dlq topic (max 5 attempts)
#   - Exponential retry (10s → 600s)
#   - 7-day message retention
#
# Pub/Sub service agent IAM (the .tf-defined parts of the DLQ trust chain):
#   - roles/iam.serviceAccountTokenCreator on pubsub-pusher (mints OIDC tokens) — below
#   - roles/pubsub.subscriber on each subscription (forwards to DLQ) — below
#   - roles/pubsub.publisher on each DLQ topic — already granted in pubsub.tf

# ---------- OIDC pusher service account ----------
# Single SA for all push targets. It needs:
#   - Pub/Sub service agent → tokenCreator on this SA (so Pub/Sub can mint
#     OIDC tokens as this SA)
#   - This SA → run.invoker on each receiving Cloud Run service
resource "google_service_account" "pubsub_pusher" {
  account_id   = "pubsub-pusher"
  display_name = "Pub/Sub OIDC pusher to Cloud Run / Vercel"
  project      = var.project_id
}

resource "google_service_account_iam_member" "pubsub_service_agent_token_creator" {
  service_account_id = google_service_account.pubsub_pusher.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = local.pubsub_service_agent
}

# pubsub-pusher needs run.invoker on each Cloud Run target. Web-frontend
# subscriptions hit Vercel (no GCP IAM), so only the two agent targets need grants.
resource "google_cloud_run_v2_service_iam_member" "pubsub_invoker_on_monitor" {
  project  = var.project_id
  location = var.region
  name     = module.monitor_agent.service_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_pusher.email}"
}

resource "google_cloud_run_v2_service_iam_member" "pubsub_invoker_on_claim" {
  project  = var.project_id
  location = var.region
  name     = module.claim_agent.service_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_pusher.email}"
}

# ---------- Push subscription map ----------
# Key = subscription name. Each entry resolves to a fully-qualified push URL via
# "${endpoint}${path}". The split lets the map stay readable while module
# outputs (Cloud Run URLs) interpolate at plan time.
locals {
  subscriptions = {
    "purchase.ingested-monitor-agent-sub" = {
      topic    = "purchase.ingested"
      endpoint = module.monitor_agent.service_url
      path     = "/pubsub/purchase.ingested"
    }
    "purchase.ingested-web-frontend-sub" = {
      topic    = "purchase.ingested"
      endpoint = var.web_frontend_url
      path     = "/api/v1/pubsub/purchase.ingested"
    }
    "price.dropped-claim-agent-sub" = {
      topic    = "price.dropped"
      endpoint = module.claim_agent.service_url
      path     = "/pubsub/price.dropped"
    }
    "claim.drafted-web-frontend-sub" = {
      topic    = "claim.drafted"
      endpoint = var.web_frontend_url
      path     = "/api/v1/pubsub/claim.drafted"
    }
    "claim.approved-claim-agent-sub" = {
      topic    = "claim.approved"
      endpoint = module.claim_agent.service_url
      path     = "/pubsub/claim.approved"
    }
    "claim.resolved-claim-agent-sub" = {
      topic    = "claim.resolved"
      endpoint = module.claim_agent.service_url
      path     = "/pubsub/claim.resolved"
    }
    "claim.redraft_requested-claim-agent-sub" = {
      topic    = "claim.redraft_requested"
      endpoint = module.claim_agent.service_url
      path     = "/pubsub/claim.redraft_requested"
    }
  }
}

resource "google_pubsub_subscription" "push" {
  for_each = local.subscriptions

  name    = each.key
  topic   = google_pubsub_topic.main[each.value.topic].id
  project = var.project_id

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s" # 7 days

  push_config {
    push_endpoint = "${each.value.endpoint}${each.value.path}"

    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
    }
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dlq["${each.value.topic}.dlq"].id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  # Wait for the tokenCreator grant so the very first push doesn't 403 on token
  # minting. The run.invoker grants are also load-bearing but only at push time,
  # so they don't strictly need depends_on for resource creation order.
  depends_on = [
    google_service_account_iam_member.pubsub_service_agent_token_creator,
  ]
}

# ---------- DLQ subscriber permission on each subscription ----------
# 1.12 review: the Pub/Sub service agent needs roles/pubsub.subscriber at the
# subscription level (not topic level) to forward messages exceeding
# max_delivery_attempts to the configured dead_letter_topic.
resource "google_pubsub_subscription_iam_member" "service_agent_dlq_subscriber" {
  for_each = local.subscriptions

  project      = var.project_id
  subscription = google_pubsub_subscription.push[each.key].name
  role         = "roles/pubsub.subscriber"
  member       = local.pubsub_service_agent
}
