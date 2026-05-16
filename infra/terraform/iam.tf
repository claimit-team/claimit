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
    ingest    = module.ingest_agent.service_account_email
    monitor   = module.monitor_agent.service_account_email
    claim     = module.claim_agent.service_account_email
    assistant = module.assistant_agent.service_account_email
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
  ])
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "serviceAccount:claimit-ci@${var.project_id}.iam.gserviceaccount.com"
}

# CI service account needs aiplatform.user to deploy ADK agent definitions
# via scripts/deploy_agents.py in the deploy-agents.yml workflow (ticket 1.29).
resource "google_project_iam_member" "ci_aiplatform_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:claimit-ci@${var.project_id}.iam.gserviceaccount.com"
}
