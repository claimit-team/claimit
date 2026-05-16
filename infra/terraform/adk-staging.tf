# ADK Agent Engine staging bucket.
#
# Required by vertexai.Client.agent_engines.create() — SDK uploads agent code
# to this bucket before deploying to Reasoning Engine runtime. Verified empirically:
# create() without staging_bucket raises:
#   ValueError: Please provide a `staging_bucket` in client.agent_engines.create(...)
#
# Used by scripts/deploy_agents.py in the deploy-agents.yml workflow (ticket 1.29).

resource "google_storage_bucket" "adk_staging" {
  name          = "${var.project_id}-adk-staging"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # ADK uploads source bundles per deploy; old versions get GC'd
  # by SDK itself, but a hard cap is a safety net.
  lifecycle_rule {
    condition {
      age = 30 # days
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    purpose = "adk-staging"
    managed = "terraform"
  }
}

# CI SA needs to write source bundles into the staging bucket.
resource "google_storage_bucket_iam_member" "ci_adk_staging" {
  bucket = google_storage_bucket.adk_staging.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:claimit-ci@${var.project_id}.iam.gserviceaccount.com"
}

# Agent runtime SAs also need read access (Agent Engine runtime reads the
# staged code to start agent processes).
resource "google_storage_bucket_iam_member" "agent_runtime_adk_staging" {
  for_each = {
    ingest    = module.ingest_agent.service_account_email
    monitor   = module.monitor_agent.service_account_email
    claim     = module.claim_agent.service_account_email
    assistant = module.assistant_agent.service_account_email
  }
  bucket = google_storage_bucket.adk_staging.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${each.value}"
}
