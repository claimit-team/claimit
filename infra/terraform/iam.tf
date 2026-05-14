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
