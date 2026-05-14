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
#
# Note: gmail-oauth-client-id and gmail-oauth-client-secret are managed manually
# (see comment above the shared_secret_ids local) and not in google_secret_manager_secret.shared,
# but they appear in ingest_secrets and claim_secrets below. This works because
# the module's IAM resource passes secret_id as a string (not a resource ref),
# so the grant succeeds as long as the secret exists in GCP — which it does.
locals {
  # ingest: parses Gmail inboxes → MongoDB; calls Vertex AI via Agent Builder;
  # scrapes order pages when emails lack structured data.
  ingest_secrets = {
    MONGODB_URI               = "mongodb-uri"
    SCRAPERAPI_KEY            = "scraperapi-key"
    AGENT_BUILDER_SA_KEY      = "agent-builder-sa-key"
    GMAIL_OAUTH_CLIENT_ID     = "gmail-oauth-client-id"
    GMAIL_OAUTH_CLIENT_SECRET = "gmail-oauth-client-secret"
  }
  # monitor: polls current prices via Keepa (Amazon), Amadeus (travel),
  # ScraperAPI (retail fallback); writes price-history records.
  monitor_secrets = {
    MONGODB_URI           = "mongodb-uri"
    KEEPA_API_KEY         = "keepa-api-key"
    SCRAPERAPI_KEY        = "scraperapi-key"
    AMADEUS_CLIENT_ID     = "amadeus-client-id"
    AMADEUS_CLIENT_SECRET = "amadeus-client-secret"
  }
  # claim: drafts refund claims via Anthropic + Agent Builder; sends them via
  # the user's Gmail (OAuth client); telemetry to Elastic.
  claim_secrets = {
    MONGODB_URI               = "mongodb-uri"
    ANTHROPIC_API_KEY         = "anthropic-api-key"
    AGENT_BUILDER_SA_KEY      = "agent-builder-sa-key"
    ELASTIC_URL               = "elastic-url"
    ELASTIC_API_KEY           = "elastic-api-key"
    GMAIL_OAUTH_CLIENT_ID     = "gmail-oauth-client-id"
    GMAIL_OAUTH_CLIENT_SECRET = "gmail-oauth-client-secret"
  }
  # assistant: conversational orchestrator — Anthropic + Agent Builder for
  # sub-agent calls; Elastic for telemetry; Phoenix for LLM tracing.
  assistant_secrets = {
    MONGODB_URI          = "mongodb-uri"
    ANTHROPIC_API_KEY    = "anthropic-api-key"
    AGENT_BUILDER_SA_KEY = "agent-builder-sa-key"
    ELASTIC_URL          = "elastic-url"
    ELASTIC_API_KEY      = "elastic-api-key"
    PHOENIX_API_KEY      = "phoenix-api-key"
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
