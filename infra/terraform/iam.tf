# Project-level IAM bindings for the 4 Cloud Run agent service accounts.
#
# Each agent SA gets roles/aiplatform.user so it can invoke Vertex AI Agent
# Builder (ADK orchestration) and Gemini models. This is Google's documented
# minimum role for ADK runtime; finer-grained options (aiplatform.modelUser)
# exist but don't cover the full Agent Builder API surface.
#
# Per-secret IAM is handled inside the cloud-run-agent module (secretAccessor
# scoped to each agent's specific secret list in main.tf). This file is for
# project-wide grants that don't need per-resource scoping.

locals {
  agent_service_accounts = {
    ingest      = module.ingest_agent.service_account_email
    monitor     = module.monitor_agent.service_account_email
    claim       = module.claim_agent.service_account_email
    assistant   = module.assistant_agent.service_account_email
    api_gateway = module.api_gateway.service_account_email
  }
}

resource "google_project_iam_member" "agent_aiplatform_user" {
  for_each = local.agent_service_accounts

  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${each.value}"
}

# CI service account needs run.invoker on each Cloud Run service so the
# deploy-prod workflow's verify_health step can hit /health with an
# identity token. Service names listed in full (sync-worker breaks the
# claimit-${name}-agent suffix pattern).
resource "google_cloud_run_v2_service_iam_member" "ci_invoker" {
  for_each = toset([
    "claimit-ingest-agent",
    "claimit-monitor-agent",
    "claimit-claim-agent",
    "claimit-assistant-agent",
    "claimit-sync-worker",
    "claimit-api-gateway",
  ])
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "serviceAccount:claimit-ci@${var.project_id}.iam.gserviceaccount.com"
}

# api-gateway is the only browser-facing service. End users authenticate
# via Firebase ID tokens, which the 6.1 auth middleware verifies in-app
# using firebase-admin. Cloud Run's Layer-2 IAM cannot evaluate Firebase
# tokens (it's designed for GCP IAM principals), so we open Layer-2 to
# allUsers and let the application layer enforce real authentication.
#
# Per Cloud Run docs on end-user auth:
# https://cloud.google.com/run/docs/authenticating/end-users
#
# Other services (agents, sync-worker) intentionally remain CI-only —
# they're invoked by Pub/Sub push subscriptions and Cloud Scheduler,
# both of which carry proper GCP service-account identity.
resource "google_cloud_run_v2_service_iam_member" "api_gateway_public_invoker" {
  project  = var.project_id
  location = var.region
  name     = "claimit-api-gateway"
  role     = "roles/run.invoker"
  member   = "allUsers"

  depends_on = [module.api_gateway]
}

# CI service account needs aiplatform.user to deploy ADK agent definitions
# via scripts/deploy_agents.py in the deploy-agents.yml workflow (ticket 1.29).
resource "google_project_iam_member" "ci_aiplatform_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:claimit-ci@${var.project_id}.iam.gserviceaccount.com"
}

# api-gateway needs to CREATE per-user secrets (gmail-refresh-token-{user_id})
# on first Gmail OAuth connection plus ADD_VERSION on re-connections. Project-
# level admin is intentionally broad for the hackathon; production should
# scope this via IAM Conditions on the gmail-refresh-token-* name pattern.
# Per-secret secretAccessor for the existing api_gateway_secrets (including
# the new gmail-oauth-state-jwt-key) is already granted by the cloud-run-agent
# module; this admin role subsumes that for those secrets too.
resource "google_project_iam_member" "api_gateway_secretmanager_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:claimit-api-gateway@${var.project_id}.iam.gserviceaccount.com"
}
