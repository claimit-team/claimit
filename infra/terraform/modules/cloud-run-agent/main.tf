# Per-service service account. Account id is derived from service_name to keep
# the resources visually paired in GCP console.
resource "google_service_account" "agent" {
  account_id   = var.service_name
  display_name = "Service account for ${var.service_name}"
  project      = var.project_id
}

# Grant the SA secretAccessor on each shared secret it needs to read at runtime.
# Union secret_ids with values(secret_env_map) so any secret mounted as an env
# var is always backed by an IAM grant — protects callers from a typo causing a
# silent permission-denied at Cloud Run deploy time.
resource "google_secret_manager_secret_iam_member" "agent_secret_access" {
  for_each = toset(concat(var.secret_ids, values(var.secret_env_map)))

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.agent.email}"
}

resource "google_cloud_run_v2_service" "agent" {
  name     = var.service_name
  location = var.region
  project  = var.project_id

  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.deletion_protection

  template {
    service_account = google_service_account.agent.email
    timeout         = "${var.timeout_seconds}s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      ports {
        container_port = var.container_port
      }

      # version = "latest" is resolved at revision boot, not on every request.
      # Rotating the secret requires a new revision (terraform apply / redeploy)
      # for the new value to take effect.
      dynamic "env" {
        for_each = var.secret_env_map
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        cpu_idle = true
      }

      startup_probe {
        http_get {
          path = "/health"
          port = var.container_port
        }
        initial_delay_seconds = 5
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 6
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = var.container_port
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.agent_secret_access]
}
