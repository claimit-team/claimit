# ClaimIt Cloud Scheduler jobs.
#
# Three scheduled HTTP triggers, all in UTC:
#   - claimit-monitor-cron         every 15 min — monitor agent price polling
#   - claimit-gmail-watch-renewal  daily 03:00  — ingest agent watch refresh
#   - claimit-smoke-test           daily 04:00  — GitHub Actions dispatch (PAUSED)
#
# Auth model:
#   - Cloud Run targets use OIDC tokens minted as `pubsub_pusher`, the SA created
#     in subscriptions.tf. Reused here to keep all push-style auth on one SA.
#   - The Cloud Scheduler service agent needs tokenCreator on pubsub_pusher
#     separately from the Pub/Sub service agent grant — different principal.

# ---------- Cloud Scheduler service agent → tokenCreator on pubsub_pusher ----------
resource "google_service_account_iam_member" "scheduler_service_agent_token_creator" {
  service_account_id = google_service_account.pubsub_pusher.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
}

# ---------- pubsub_pusher → run.invoker on ingest_agent ----------
# subscriptions.tf already grants this on monitor_agent and claim_agent;
# ingest_agent is the new target introduced by Job 2 (Gmail watch renewal).
resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker_on_ingest" {
  project  = var.project_id
  location = var.region
  name     = module.ingest_agent.service_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_pusher.email}"
}

# ---------- Job 1: monitor cron (every 15 min) ----------
resource "google_cloud_scheduler_job" "monitor_cron" {
  name        = "claimit-monitor-cron"
  description = "Trigger monitor-agent every 15 minutes for price polling."
  project     = var.project_id
  region      = var.region
  schedule    = "*/15 * * * *"
  time_zone   = "UTC"

  retry_config {
    retry_count          = 1
    min_backoff_duration = "10s"
    max_retry_duration   = "60s"
  }

  http_target {
    uri         = "${module.monitor_agent.service_url}/cron"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
      audience              = module.monitor_agent.service_url
    }
  }

  depends_on = [google_service_account_iam_member.scheduler_service_agent_token_creator]
}

# ---------- Job 2: Gmail watch renewal (daily 03:00 UTC) ----------
resource "google_cloud_scheduler_job" "gmail_watch_renewal" {
  name        = "claimit-gmail-watch-renewal"
  description = "Renew Gmail push-notification watches daily at 03:00 UTC."
  project     = var.project_id
  region      = var.region
  schedule    = "0 3 * * *"
  time_zone   = "UTC"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "30s"
    max_retry_duration   = "300s"
  }

  http_target {
    uri         = "${module.ingest_agent.service_url}/renew-watches"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
      audience              = module.ingest_agent.service_url
    }
  }

  depends_on = [
    google_service_account_iam_member.scheduler_service_agent_token_creator,
    google_cloud_run_v2_service_iam_member.scheduler_invoker_on_ingest,
  ]
}

# ---------- Job 3: GitHub Actions smoke test (PAUSED) ----------
# Daily 04:00 UTC — fires a repository_dispatch event so a CI workflow can run
# an end-to-end smoke test.
#
# Currently PAUSED. To enable:
#   1. Create a GitHub token that can call repository_dispatch on
#      claimit-team/claimit, store it in Secret Manager as `github-pat`.
#      - Classic PAT: `repo` scope
#      - Fine-grained PAT: repository "Contents" permission (write)
#   2. Cloud Scheduler cannot inject Secret Manager values into HTTP headers
#      directly. Two options:
#        a) Add a tiny proxy endpoint on one of the agents (e.g.
#           assistant-agent /admin/smoke-test) that reads the PAT and forwards
#           to GitHub. Repoint this job at that endpoint with oidc_token (same
#           pattern as Jobs 1 and 2).
#        b) Use a Cloud Workflow that pulls the secret and calls the GitHub API.
#   3. Flip `paused = false` once one of the above is in place.
resource "google_cloud_scheduler_job" "smoke_test" {
  name        = "claimit-smoke-test"
  description = "Daily GitHub Actions dispatch for end-to-end smoke testing (PAUSED until PAT wiring)."
  project     = var.project_id
  region      = var.region
  schedule    = "0 4 * * *"
  time_zone   = "UTC"
  paused      = true

  retry_config {
    retry_count        = 1
    max_retry_duration = "60s"
  }

  http_target {
    uri         = "https://api.github.com/repos/claimit-team/claimit/dispatches"
    http_method = "POST"
    body        = base64encode(jsonencode({ event_type = "smoke-test" }))

    headers = {
      "Content-Type" = "application/json"
      "Accept"       = "application/vnd.github+json"
    }
  }
}
