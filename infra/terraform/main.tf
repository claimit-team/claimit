provider "google" {
  project = var.project_id
  region  = var.region
}

# ---------- Artifact Registry ----------
resource "google_artifact_registry_repository" "claimit" {
  location      = var.region
  repository_id = var.artifact_registry_repo
  format        = "DOCKER"
  description   = "ClaimIt agent container images"
}

# ---------- Secret Manager (empty shells; real values added out-of-band) ----------
# Note: gmail-oauth-client-id and gmail-oauth-client-secret are managed manually
# (created out-of-band in ticket 1.17) and intentionally NOT declared here —
# re-declaring would conflict on the next `terraform apply` unless imported
# first. Bring them under terraform when convenient via:
#   terraform import 'google_secret_manager_secret.shared["gmail-oauth-client-id"]' \
#     projects/<PROJECT>/secrets/gmail-oauth-client-id
locals {
  shared_secret_ids = [
    "mongodb-uri",
    "anthropic-api-key",
    "keepa-api-key",
    "scraperapi-key",
    "elastic-url",
    "elastic-api-key",
    "agent-builder-sa-key",
    "amadeus-client-id",
    "amadeus-client-secret",
    "phoenix-api-key",
    "demo-password",
  ]
}

resource "google_secret_manager_secret" "shared" {
  for_each  = toset(local.shared_secret_ids)
  secret_id = each.value

  replication {
    auto {}
  }
}

# ---------- Cloud Run services ----------
# Per-agent secret access. Each map is ENV_VAR_NAME => secret-manager-secret-id;
# the module both grants secretAccessor and mounts the env var from Secret Manager.
locals {
  ingest_secrets = {
    MONGODB_URI    = "mongodb-uri"
    SCRAPERAPI_KEY = "scraperapi-key"
  }
  monitor_secrets = {
    MONGODB_URI    = "mongodb-uri"
    KEEPA_API_KEY  = "keepa-api-key"
    SCRAPERAPI_KEY = "scraperapi-key"
  }
  claim_secrets = {
    MONGODB_URI       = "mongodb-uri"
    ANTHROPIC_API_KEY = "anthropic-api-key"
  }
  assistant_secrets = {
    MONGODB_URI       = "mongodb-uri"
    ANTHROPIC_API_KEY = "anthropic-api-key"
  }
}

module "ingest_agent" {
  source = "./modules/cloud-run-agent"

  project_id          = var.project_id
  region              = var.region
  service_name        = "claimit-ingest-agent"
  image               = var.ingest_agent_image
  secret_ids          = values(local.ingest_secrets)
  secret_env_map      = local.ingest_secrets
  # Hackathon scope; flip to true once services handle real data.
  deletion_protection = false

  depends_on = [google_secret_manager_secret.shared]
}

module "monitor_agent" {
  source = "./modules/cloud-run-agent"

  project_id          = var.project_id
  region              = var.region
  service_name        = "claimit-monitor-agent"
  image               = var.monitor_agent_image
  memory_limit        = "2Gi" # monitor-agent runs Playwright + Chromium; default 1Gi will OOM
  secret_ids          = values(local.monitor_secrets)
  secret_env_map      = local.monitor_secrets
  deletion_protection = false

  depends_on = [google_secret_manager_secret.shared]
}

module "claim_agent" {
  source = "./modules/cloud-run-agent"

  project_id          = var.project_id
  region              = var.region
  service_name        = "claimit-claim-agent"
  image               = var.claim_agent_image
  secret_ids          = values(local.claim_secrets)
  secret_env_map      = local.claim_secrets
  deletion_protection = false

  depends_on = [google_secret_manager_secret.shared]
}

module "assistant_agent" {
  source = "./modules/cloud-run-agent"

  project_id          = var.project_id
  region              = var.region
  service_name        = "claimit-assistant-agent"
  image               = var.assistant_agent_image
  secret_ids          = values(local.assistant_secrets)
  secret_env_map      = local.assistant_secrets
  deletion_protection = false

  depends_on = [google_secret_manager_secret.shared]
}
