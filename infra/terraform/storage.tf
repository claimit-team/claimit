# Evidence bucket for price-drop screenshots captured by the monitor-agent
# Screenshot service (ticket 4.12). Each PNG is uploaded with a 30-day signed
# URL referenced from PriceHistory.evidence_screenshot_url and consumed by
# the claim-agent draft tool.
#
# The monitor-agent Cloud Run service should set EVIDENCE_BUCKET=<this bucket
# name> via env var so screenshot.py's storage.Client().bucket(...) call
# resolves correctly. Default in screenshot.py is "claimit-evidence-dev" for
# local dev; production should override.

resource "google_storage_bucket" "evidence" {
  name          = "${var.project_id}-evidence"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Screenshots are short-lived evidence; 90-day retention keeps storage
  # cost bounded while preserving evidence for any in-flight claims.
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    purpose = "evidence"
    managed = "terraform"
  }
}

# Monitor Agent SA writes screenshots to the bucket.
resource "google_storage_bucket_iam_member" "monitor_agent_evidence_writer" {
  bucket = google_storage_bucket.evidence.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${module.monitor_agent.service_account_email}"
}

# Monitor Agent SA self-impersonates to sign URLs without a private key.
# generate_signed_url(version="v4") needs to call iam.signBlob; in Cloud Run
# the canonical pattern is to bind serviceAccountTokenCreator on the SA to
# the SA itself. This is NOT a bucket-level binding — it lives on the SA.
resource "google_service_account_iam_member" "monitor_agent_self_token_creator" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${module.monitor_agent.service_account_email}"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${module.monitor_agent.service_account_email}"
}

# Claim Agent SA reads screenshots when generating policy drafts (the
# gemini_generate_draft tool accepts evidence_snapshot_url as input).
resource "google_storage_bucket_iam_member" "claim_agent_evidence_reader" {
  bucket = google_storage_bucket.evidence.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${module.claim_agent.service_account_email}"
}

# Receipts bucket for manually-uploaded purchase receipts (ticket 6.3).
# The api-gateway writes here on POST /api/v1/purchases/upload, and the
# ingest-agent reads to extract structured purchase data from the file.
# Longer retention than evidence — receipts may back claims for the
# full price-match window plus a margin.
resource "google_storage_bucket" "receipts" {
  name          = "${var.project_id}-receipts"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    purpose = "receipts"
    managed = "terraform"
  }
}

# api-gateway SA writes uploaded receipts to the bucket.
resource "google_storage_bucket_iam_member" "api_gateway_receipts_writer" {
  bucket = google_storage_bucket.receipts.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${module.api_gateway.service_account_email}"
}

# api-gateway SA also reads (e.g. surfacing receipt URLs back to UI).
resource "google_storage_bucket_iam_member" "api_gateway_receipts_reader" {
  bucket = google_storage_bucket.receipts.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${module.api_gateway.service_account_email}"
}

# ingest-agent SA reads uploaded receipts to extract purchase data.
resource "google_storage_bucket_iam_member" "ingest_agent_receipts_reader" {
  bucket = google_storage_bucket.receipts.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${module.ingest_agent.service_account_email}"
}
