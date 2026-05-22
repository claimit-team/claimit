provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
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
    "sendgrid-api-key",
    "elastic-url",
    "elastic-api-key",
    # amadeus-client-id and amadeus-client-secret removed — self-service portal
    # closing July 2026, no sandbox credentials available. Re-add when an
    # alternative travel-price source is set up.
    "phoenix-api-key",
    "demo-password",
    # ADK agent IDs - written by scripts/deploy_agents.py after deploying each
    # agent to Agent Platform Runtime. Used by Cloud Run agents to know their
    # own deployed runtime resource_name (e.g., when invoking sub-agents).
    "claimit-ingest-agent-id",
    "claimit-monitor-agent-id",
    "claimit-claim-agent-id",
    "claimit-assistant-agent-id",
  ]
}

resource "google_secret_manager_secret" "shared" {
  for_each  = toset(local.shared_secret_ids)
  secret_id = each.value

  replication {
    auto {}
  }
}

# Gmail OAuth state JWT signing key (ticket 4.14). Generated in-Terraform via
# random_password and stored as a Secret Manager secret; api-gateway reads it
# at boot via STATE_JWT_SECRET env var (mounted from secret payload) to sign
# the OAuth `state` parameter (CSRF protection for /api/v1/gmail/callback).
resource "random_password" "gmail_oauth_state_jwt_key" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret" "gmail_oauth_state_jwt_key" {
  secret_id = "gmail-oauth-state-jwt-key"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "gmail_oauth_state_jwt_key" {
  secret      = google_secret_manager_secret.gmail_oauth_state_jwt_key.id
  secret_data = random_password.gmail_oauth_state_jwt_key.result
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
    GMAIL_OAUTH_CLIENT_ID     = "gmail-oauth-client-id"
    GMAIL_OAUTH_CLIENT_SECRET = "gmail-oauth-client-secret"
    SENDGRID_API_KEY          = "sendgrid-api-key"
  }
  # monitor: polls current prices via Keepa (Amazon), Amadeus (travel),
  # ScraperAPI (retail fallback); writes price-history records.
  monitor_secrets = {
    MONGODB_URI    = "mongodb-uri"
    KEEPA_API_KEY  = "keepa-api-key"
    SCRAPERAPI_KEY = "scraperapi-key"
    # AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET removed — Amadeus
    # self-service portal closing July 2026, no sandbox credentials available.
    # Re-add when an alternative travel-price source is set up.
  }
  # claim: drafts refund claims via Anthropic + Agent Builder; sends them via
  # the user's Gmail (OAuth client); telemetry to Elastic.
  claim_secrets = {
    MONGODB_URI       = "mongodb-uri"
    ANTHROPIC_API_KEY = "anthropic-api-key"
    ELASTIC_URL       = "elastic-url"
    ELASTIC_API_KEY   = "elastic-api-key"
    # Required for OTel→Phoenix export. Without it, init_phoenix
    # short-circuits and claim-agent's `validator.validate` /
    # `self_evaluate.evaluate` spans never reach Phoenix — which means
    # the assistant's Mode B `get_reasoning_trace` query always falls
    # back to claim-doc-only context regardless of PHOENIX_PROJECT_NAME.
    PHOENIX_API_KEY           = "phoenix-api-key"
    GMAIL_OAUTH_CLIENT_ID     = "gmail-oauth-client-id"
    GMAIL_OAUTH_CLIENT_SECRET = "gmail-oauth-client-secret"
  }
  # assistant: conversational orchestrator — Anthropic + Agent Builder for
  # sub-agent calls; Elastic for telemetry; Phoenix for LLM tracing.
  assistant_secrets = {
    MONGODB_URI       = "mongodb-uri"
    ANTHROPIC_API_KEY = "anthropic-api-key"
    ELASTIC_URL       = "elastic-url"
    ELASTIC_API_KEY   = "elastic-api-key"
    PHOENIX_API_KEY   = "phoenix-api-key"
  }
  # sync-worker: tails MongoDB change streams and mirrors writes into
  # Elasticsearch indices. Not an ADK agent — no Vertex AI dependency.
  sync_worker_secrets = {
    MONGODB_URI     = "mongodb-uri"
    ELASTIC_URL     = "elastic-url"
    ELASTIC_API_KEY = "elastic-api-key"
  }
  # api-gateway: BFF layer. Reads MongoDB + Elastic directly, calls all 4
  # ADK agents via Agent Engine SDK, handles Gmail OAuth flow, traces to Phoenix.
  api_gateway_secrets = {
    MONGODB_URI                = "mongodb-uri"
    ELASTIC_URL                = "elastic-url"
    ELASTIC_API_KEY            = "elastic-api-key"
    PHOENIX_API_KEY            = "phoenix-api-key"
    GMAIL_OAUTH_CLIENT_ID      = "gmail-oauth-client-id"
    GMAIL_OAUTH_CLIENT_SECRET  = "gmail-oauth-client-secret"
    STATE_JWT_SECRET           = "gmail-oauth-state-jwt-key"
    CLAIMIT_INGEST_AGENT_ID    = "claimit-ingest-agent-id"
    CLAIMIT_MONITOR_AGENT_ID   = "claimit-monitor-agent-id"
    CLAIMIT_CLAIM_AGENT_ID     = "claimit-claim-agent-id"
    CLAIMIT_ASSISTANT_AGENT_ID = "claimit-assistant-agent-id"
  }
}

module "ingest_agent" {
  source = "./modules/cloud-run-agent"

  project_id     = var.project_id
  region         = var.region
  service_name   = "claimit-ingest-agent"
  image          = var.ingest_agent_image
  secret_ids     = values(local.ingest_secrets)
  secret_env_map = local.ingest_secrets
  env_vars = {
    FRONTEND_BASE_URL = var.web_frontend_url
    GCP_PROJECT_ID    = var.project_id
    # Post-5.14 prod-verification fix: some libs (notably google-cloud-pubsub
    # wrappers in api-gateway) only read GOOGLE_CLOUD_PROJECT. Cloud Run does
    # NOT auto-inject this var, so codify both names — keeps ingest-agent and
    # api-gateway in lockstep regardless of which env name a downstream
    # publisher prefers. Same value for both; pulls from var.project_id.
    GOOGLE_CLOUD_PROJECT = var.project_id
    # Required for google-genai Vertex mode. Codifies the manual
    # `gcloud run services update ... --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_LOCATION=us-east1`
    # applied during 5.14 prod-verify so the next `terraform apply`
    # doesn't wipe it. Without these the SDK defaults toward API-key
    # mode and `Runner.run_async` raises `No API key was provided`
    # before `extract_from_blob` ever reaches the model — every upload
    # then falls through to the rescue path. ADC against Vertex is
    # already wired (`roles/aiplatform.user` on the agent SA in
    # `infra/terraform/iam.tf`), so this is the only missing piece.
    GOOGLE_GENAI_USE_VERTEXAI = "true"
    GOOGLE_CLOUD_LOCATION     = var.region
    # Ticket 5.14: the /pubsub/purchase.uploaded handler reads receipt
    # blobs out of this bucket. Same value as api-gateway's mount so the
    # gs:// URI written on upload is the URI ingest-agent fetches.
    RECEIPTS_BUCKET = google_storage_bucket.receipts.name
    # Ticket 4.16: the /renew-watches handler calls Gmail users.watch,
    # which needs the fully-qualified topic resource name in the body.
    # Same .id-form path api-gateway already passes — keeping the two
    # services in lockstep so a future topic rename only updates one
    # var reference per service.
    GMAIL_INBOUND_TOPIC = google_pubsub_topic.gmail_inbound.id
  }
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

  project_id     = var.project_id
  region         = var.region
  service_name   = "claimit-claim-agent"
  image          = var.claim_agent_image
  secret_ids     = values(local.claim_secrets)
  secret_env_map = local.claim_secrets
  env_vars = {
    # Required for google-genai Vertex mode. The claim-agent runs
    # the same on-Cloud-Run `Runner.run_async` path as ingest-agent
    # (see `apps/claim-agent/src/draft/_shared.py` +
    # `self_evaluate.py`); without these env vars, the first draft
    # generation against a real price-drop event would raise
    # `No API key was provided` exactly like the 5.14 ingest
    # failure. Codified preemptively rather than waiting for the
    # next prod claim run to flush it out. ADC + `aiplatform.user`
    # on the SA (`infra/terraform/iam.tf`) already wired.
    GOOGLE_CLOUD_PROJECT      = var.project_id
    GOOGLE_GENAI_USE_VERTEXAI = "true"
    GOOGLE_CLOUD_LOCATION     = var.region
    PHOENIX_PROJECT_NAME      = "claimit"
  }
  deletion_protection = false

  depends_on = [google_secret_manager_secret.shared]
}

module "assistant_agent" {
  source = "./modules/cloud-run-agent"

  project_id     = var.project_id
  region         = var.region
  service_name   = "claimit-assistant-agent"
  image          = var.assistant_agent_image
  secret_ids     = values(local.assistant_secrets)
  secret_env_map = local.assistant_secrets
  env_vars = {
    # Query base URL for Phoenix Cloud — distinct from the OTLP collector
    # path (.../v1/traces) that PHOENIX_COLLECTOR_ENDPOINT points at.
    # Mode B's get_reasoning_trace tool reads this to query spans for a
    # claim (ticket 3.24) AND to construct the in-app deep link the user
    # can click to inspect the trace directly.
    PHOENIX_BASE_URL = "https://app.phoenix.arize.com/s/claimitbeta"
    # Project routing — init_phoenix sets this as the OpenInference
    # `openinference.project.name` resource attribute so spans land in
    # the `claimit` project (not `default`). The read side queries the
    # same project name. Until claim-agent / monitor-agent / ingest-
    # agent also set this, the assistant only sees its OWN spans, not
    # the claim-agent spans it needs for Mode B explanations — tracked
    # as a follow-up issue.
    PHOENIX_PROJECT_NAME = "claimit"
  }
  deletion_protection = false

  depends_on = [google_secret_manager_secret.shared]
}

module "sync_worker" {
  source = "./modules/cloud-run-agent"

  project_id   = var.project_id
  region       = var.region
  service_name = "claimit-sync-worker"
  image        = var.sync_worker_image
  # Change streams hold long-lived cursors; scale-to-zero would tear them
  # down and waste the persisted resume token on every cold start.
  min_instances       = 1
  secret_ids          = values(local.sync_worker_secrets)
  secret_env_map      = local.sync_worker_secrets
  deletion_protection = false

  depends_on = [google_secret_manager_secret.shared]
}

module "api_gateway" {
  source = "./modules/cloud-run-agent"

  project_id     = var.project_id
  region         = var.region
  service_name   = "claimit-api-gateway"
  image          = var.api_gateway_image
  secret_ids     = values(local.api_gateway_secrets)
  secret_env_map = local.api_gateway_secrets
  env_vars = {
    CORS_ALLOWED_ORIGINS      = "https://claimitai.vercel.app,http://localhost:3000"
    CORS_ALLOWED_ORIGIN_REGEX = "https://claimitai[a-z0-9-]*\\.vercel\\.app"
    GMAIL_OAUTH_REDIRECT_URI  = "https://claimit-api-gateway-i4zxjn67hq-ue.a.run.app/api/v1/gmail/callback"
    FRONTEND_BASE_URL         = var.web_frontend_url
    GCP_PROJECT_ID            = var.project_id
    # Post-5.14 prod-verification fix: pubsub_publisher.py reads
    # GOOGLE_CLOUD_PROJECT only — without this, POST /purchases/upload
    # 503'd at the first publish call. Codify alongside GCP_PROJECT_ID so a
    # future deploy doesn't wipe the temporary `gcloud run services update`.
    GOOGLE_CLOUD_PROJECT = var.project_id
    RECEIPTS_BUCKET      = google_storage_bucket.receipts.name
    # Ticket 5.8: the GET /api/v1/claims/:id/evidence proxy reads
    # price-drop screenshots from the evidence bucket (written by
    # monitor-agent's screenshot service, ticket 4.12). Value is the
    # TF resource attribute — never a hardcoded string — so the bucket
    # name stays in lockstep with infra/terraform/storage.tf across
    # envs. Matching api_gateway_evidence_reader IAM binding in
    # storage.tf grants the read access this env enables.
    EVIDENCE_BUCKET = google_storage_bucket.evidence.name
    # Ticket 4.15: the gmail-inbound topic api-gateway tells Gmail to
    # publish to during `users.watch`. The .id form yields the fully-
    # qualified `projects/<project>/topics/gmail-inbound` path Gmail
    # expects in the watch request body.
    GMAIL_INBOUND_TOPIC = google_pubsub_topic.gmail_inbound.id
  }
  deletion_protection = false

  depends_on = [
    google_secret_manager_secret.shared,
    google_secret_manager_secret.gmail_oauth_state_jwt_key,
    google_secret_manager_secret_version.gmail_oauth_state_jwt_key,
  ]
}

# Trigger plan workflow test - Sat May 16 2026 (post migration path fix)
