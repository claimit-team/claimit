# MongoDB MCP Cloud Run services (ticket 5.10).
#
# The Vertex AI Agent Engine runtime can't run the upstream
# `mongodb-mcp-server` over stdio — it has no Node.js. Hosting the
# server as two Cloud Run services (one readonly, one readwrite) lets
# the agent reach it over MCP Streamable HTTP instead. The same upstream
# image runs in both; the readonly service has `MDB_MCP_READ_ONLY=true`,
# which makes mongodb-mcp-server skip registering create/update/delete
# tools (per its README — readOnly is a tool-registration-time gate).
#
# Why two services rather than one:
# - Assistant agent is LLM-controlled + user-input-driven; prompt
#   injection into a server that even REGISTERS write tools is a real
#   attack surface. Separate readonly service eliminates the class.
# - Cost is bounded: 2× warm instances (min_instances=1) at ~$5/mo each.
# - Matches the per-agent-SA / per-secret-grant principle of least
#   privilege the rest of the infra follows.
#
# Probe: TCP-connect on the main MCP port (Option A from the design
# discussion). The upstream image's monitoring server runs on a
# separate port that Cloud Run's container-port-bound probe can't
# reach, so we drop the monitoring server entirely. "Port bound" is
# good enough for v1 health; a stale revision still binding the port
# is still observable in Cloud Run's serving metrics.
#
# Auth: roles/run.invoker granted to the Vertex AI Reasoning Engine
# service agent (verified existing principal:
# service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com).
# Each agent's per-service SA could also be granted here if any Cloud
# Run agent service ever calls the MCP server directly, but today the
# only consumer is Agent Engine reasoning runs.

locals {
  # Env vars common to both services. The connection string is mounted
  # from Secret Manager (see secret_env_map on each module).
  mongodb_mcp_common_env = {
    MDB_MCP_TRANSPORT          = "http"
    MDB_MCP_HTTP_HOST          = "0.0.0.0"
    MDB_MCP_HTTP_PORT          = "8080"
    MDB_MCP_HTTP_RESPONSE_TYPE = "sse"
    # Disable telemetry — we have our own observability (Phoenix on the
    # agent side) and don't want the MCP server phoning home with
    # query-shape data.
    MDB_MCP_TELEMETRY = "disabled"
  }

  # The Vertex AI Reasoning Engine service agent — the SA whose
  # identity the Agent Engine runtime assumes. Verified principal in
  # this project via `gcloud projects get-iam-policy`. Auto-created by
  # GCP when the aiplatform.googleapis.com API is enabled with the
  # Agent Engine feature; IAM grants referencing it succeed even before
  # the SA is materialized.
  agent_engine_reasoning_sa = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"

  # Pinned image — semver tracks daily patches within 1.10.x without
  # surprises from a future 1.11 minor or 2.x major bump. Daily-tagged
  # immutable `1.10.0-YYYY-MM-DD` tags exist if we ever need strict
  # reproducibility.
  mongodb_mcp_image = "mongodb/mongodb-mcp-server:1.10.0"
}

# ---------- Read-only service (Assistant agent target) ----------
module "mongodb_mcp_readonly" {
  source = "./modules/cloud-run-agent"

  project_id   = var.project_id
  region       = var.region
  service_name = "claimit-mongodb-mcp-readonly"
  image        = local.mongodb_mcp_image

  # readOnly=true tells the upstream server to skip registering
  # create/update/delete tools. The agent literally cannot call write
  # operations because they aren't in the toolset.
  env_vars = merge(local.mongodb_mcp_common_env, {
    MDB_MCP_READ_ONLY = "true"
  })

  # Mount the existing mongodb-uri secret into the env var the
  # mongodb-mcp-server reads at startup.
  secret_ids = ["mongodb-uri"]
  secret_env_map = {
    MDB_MCP_CONNECTION_STRING = "mongodb-uri"
  }

  # Single port for MCP traffic — see file header comment for the
  # rationale on dropping the monitoring server.
  container_port = 8080
  probe_type     = "tcp"

  # Cold start on the MCP service would add Node startup + Mongo
  # connect to the user-visible chat latency. Keep one warm. Sync-
  # worker uses the same pattern for the same reason
  # (main.tf:215-225).
  min_instances = 1

  # Hackathon scope mirroring other Cloud Run services in this project.
  deletion_protection = false
}

# ---------- Read-write service (ingest / monitor / claim targets) ----------
module "mongodb_mcp_readwrite" {
  source = "./modules/cloud-run-agent"

  project_id   = var.project_id
  region       = var.region
  service_name = "claimit-mongodb-mcp-readwrite"
  image        = local.mongodb_mcp_image

  # No MDB_MCP_READ_ONLY → upstream registers all tools (read, write,
  # connect, metadata). The three write agents (ingest, monitor, claim)
  # point at THIS service via MDB_MCP_URL; assistant points at the
  # readonly one above.
  env_vars = local.mongodb_mcp_common_env

  secret_ids = ["mongodb-uri"]
  secret_env_map = {
    MDB_MCP_CONNECTION_STRING = "mongodb-uri"
  }

  container_port = 8080
  probe_type     = "tcp"
  min_instances  = 1

  deletion_protection = false
}

# ---------- IAM: Agent Engine runtime → run.invoker on each MCP service ----------
# The Reasoning Engine runtime calls these services via ADK's
# StreamableHTTPConnectionParams with a Google OIDC ID token; Cloud
# Run validates `roles/run.invoker` for the bearer's email claim. One
# grant per service direction.

resource "google_cloud_run_v2_service_iam_member" "agent_engine_invoker_on_mongodb_mcp_readonly" {
  project  = var.project_id
  location = var.region
  name     = module.mongodb_mcp_readonly.service_name
  role     = "roles/run.invoker"
  member   = local.agent_engine_reasoning_sa
}

resource "google_cloud_run_v2_service_iam_member" "agent_engine_invoker_on_mongodb_mcp_readwrite" {
  project  = var.project_id
  location = var.region
  name     = module.mongodb_mcp_readwrite.service_name
  role     = "roles/run.invoker"
  member   = local.agent_engine_reasoning_sa
}

# ---------- Outputs — consumed by scripts/deploy_agents.py ----------
# The deploy script reads these via the google.cloud.run_v2 SDK at
# deploy time (matching how it already reads mongodb-uri from Secret
# Manager). Declaring them here makes the URL discoverable by name
# without scraping `terraform output`.

output "mongodb_mcp_readonly_url" {
  description = "Cloud Run service URL for the read-only mongodb-mcp-server. Injected as MDB_MCP_URL into the assistant agent's Agent Engine env."
  value       = module.mongodb_mcp_readonly.service_url
}

output "mongodb_mcp_readwrite_url" {
  description = "Cloud Run service URL for the read-write mongodb-mcp-server. Injected as MDB_MCP_URL into the ingest/monitor/claim agents' Agent Engine env."
  value       = module.mongodb_mcp_readwrite.service_url
}
