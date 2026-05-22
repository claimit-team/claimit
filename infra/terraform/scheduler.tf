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

# ---------- pubsub_pusher → run.invoker on claim_agent ----------
# subscriptions.tf already grants this for the Pub/Sub push subscriptions
# that fan claim.drafted into claim_agent. The auto-send cron (Job 4
# below) uses the SAME service account for OIDC, so the invoker grant
# applies to it transparently — but explicitly pinning it here documents
# the dependency and survives a future split of the two invoker grants.
resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker_on_claim_agent" {
  project  = var.project_id
  location = var.region
  name     = module.claim_agent.service_name
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

# ---------- Job 4: claim-agent auto-send cron (every 1 min) ----------
# Ticket 5.15 / WI-10. The claim-agent /internal/auto-send endpoint
# (apps/claim-agent/src/main.py L450) finds queued_for_send claims
# whose auto_send_at has elapsed, calls submit_claim, and emits the
# claim_submitted NotificationEvent that drives the dashboard banner's
# "Sent ✓" SSE flip. Without this job, queued claims would sit
# indefinitely and the auto-send pipeline would be FE-optimistic only.
#
# Single-worker: attempt_deadline 60s aligned with the cron cadence;
# the worker's re-read-then-update guard (L469-L471) is the second
# layer that prevents duplicate submits if a run goes long. Retry
# disabled — Scheduler will fire again 60s later regardless.
#
# Note on prod behavior (flagged in PR body): once this lands, queued
# claims auto-submit ~every minute. The seeded Hilton queued claim
# (WI-11) sets auto_send_at = now+20min to give a comfortable
# verify/record window; re-run the seed right before any demo so the
# banner is live.
resource "google_cloud_scheduler_job" "claim_auto_send" {
  name        = "claimit-claim-auto-send"
  description = "Trigger claim-agent /internal/auto-send every minute to submit queued claims."
  project     = var.project_id
  region      = var.region
  schedule    = "* * * * *"
  time_zone   = "UTC"

  attempt_deadline = "60s"

  retry_config {
    retry_count          = 0
    min_backoff_duration = "10s"
    max_retry_duration   = "60s"
  }

  http_target {
    uri         = "${module.claim_agent.service_url}/internal/auto-send"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.pubsub_pusher.email
      # Cloud Run expects the OIDC `aud` claim to match the service's
      # base URL (origin), NOT a path-specific URL. Mirrors the other
      # Scheduler jobs in this file (monitor_cron audience =
      # module.monitor_agent.service_url, gmail_watch_renewal audience
      # = module.ingest_agent.service_url). Setting the path-specific
      # audience caused a token-aud mismatch on the Cloud Run side
      # → 401 → the queued claims would never have been auto-submitted
      # (CodeRabbit MAJOR, PR #182).
      audience = module.claim_agent.service_url
    }
  }

  depends_on = [
    google_service_account_iam_member.scheduler_service_agent_token_creator,
    google_cloud_run_v2_service_iam_member.scheduler_invoker_on_claim_agent,
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
