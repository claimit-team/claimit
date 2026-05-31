# Phoenix MCP Cloud Run service (Phoenix observability read path at runtime).
#
# `@arizeai/phoenix-mcp` is stdio-only and the Vertex AI Agent Engine runtime has
# no Node.js, so we host it behind a `supergateway` stdio->Streamable-HTTP bridge
# on Cloud Run (custom image apps/phoenix-mcp/Dockerfile). This mirrors
# infra/terraform/mongodb_mcp.tf — the difference is that MongoDB MCP runs a
# prebuilt public image while Phoenix needs the supergateway bridge image, which
# CI builds + pushes (deploy-prod.yml) and `gcloud run deploy` swaps onto this
# service (var.phoenix_mcp_image defaults to the hello placeholder so the first
# `terraform apply` succeeds before the image exists).
#
# Read path: the four ADK agents' `get_recent_trace_summary` tool (Agent Engine)
# and the assistant's Mode B `read_claim_reasoning_spans` (in-process on Cloud
# Run) call this service over MCP Streamable HTTP. The OIDC bearer is attached by
# the same request event hook in claimit_mcp that authenticates MongoDB MCP.
#
# Auth: roles/run.invoker to (a) the Vertex AI Reasoning Engine service agent
# (local.agent_engine_reasoning_sa, shared with mongodb_mcp.tf) and (b) the
# assistant Cloud Run service account (Mode B reads spans in-process).
#
# Secret: PHOENIX_API_KEY mounted from Secret Manager (the `phoenix-api-key`
# secret already declared in main.tf), read by the supergateway entrypoint to
# launch phoenix-mcp with --apiKey — never inlined into args or TF state.

module "phoenix_mcp" {
  source = "./modules/cloud-run-agent"

  project_id   = var.project_id
  region       = var.region
  service_name = "claimit-phoenix-mcp"
  image        = var.phoenix_mcp_image

  # The MCP --baseUrl (Phoenix Cloud query host). Distinct from the OTLP
  # collector path (.../v1/traces) used on the write/tracing side.
  env_vars = {
    PHOENIX_BASE_URL = "https://app.phoenix.arize.com/s/claimitbeta"
  }

  secret_ids = ["phoenix-api-key"]
  secret_env_map = {
    PHOENIX_API_KEY = "phoenix-api-key"
  }

  # supergateway serves MCP on this port; probe is TCP-connect because the
  # placeholder hello image (first-apply window) doesn't serve /healthz on it.
  container_port = 8080
  probe_type     = "tcp"

  # Keep one warm instance — cold start (Node boot + npx spawn + Phoenix connect)
  # would land on the latency-sensitive Mode B "explain this draft" turn.
  min_instances = 1

  deletion_protection = false
}

# ---------- IAM: Agent Engine runtime -> run.invoker (the four agents' tool) ----------
resource "google_cloud_run_v2_service_iam_member" "agent_engine_invoker_on_phoenix_mcp" {
  project  = var.project_id
  location = var.region
  name     = module.phoenix_mcp.service_name
  role     = "roles/run.invoker"
  member   = local.agent_engine_reasoning_sa
}

# ---------- IAM: assistant Cloud Run SA -> run.invoker (Mode B in-process read) ----------
resource "google_cloud_run_v2_service_iam_member" "assistant_invoker_on_phoenix_mcp" {
  project  = var.project_id
  location = var.region
  name     = module.phoenix_mcp.service_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${module.assistant_agent.service_account_email}"
}

# ---------- Output — consumed by scripts/deploy_agents.py (via run_v2) ----------
output "phoenix_mcp_url" {
  description = "Cloud Run service URL for the Phoenix MCP server. Injected as PHOENIX_MCP_URL into all four agents' Agent Engine env and the assistant Cloud Run service."
  value       = module.phoenix_mcp.service_url
}
