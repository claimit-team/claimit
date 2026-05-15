# ClaimIt Cloud Monitoring alerts.
#
# Three alert policies wired to a single Slack notification channel:
#   - Cloud Run error rate > 5% over 5 min (per service)
#   - DLQ topic received any message (immediate, per DLQ topic)
#   - Cloud Run instance count > 4 (per service) — approaching the max=5 cap
#     baked into the cloud-run-agent module defaults.

# ---------- Slack notification channel ----------
# GCP's Slack notification channel uses OAuth-based authentication
# (Bot User OAuth Token), which is stored internally by GCP and cannot
# be exported. As a result, Terraform cannot manage this resource as
# a `resource` block — any attempt to set auth_token (even to "") will
# cause GCP API to reject the update.
#
# Instead, this is referenced as a data source. The channel must be
# created manually via GCP Console:
#   Monitoring → Alerting → Notification Channels → Add New → Slack
#   → "Connect to Slack" → authorize → select #claimit-alerts
# The display_name MUST exactly match "ClaimIt Alerts Slack".
data "google_monitoring_notification_channel" "slack" {
  display_name = "ClaimIt Alerts Slack"
}

# ---------- Alert 1: Cloud Run error rate > 5% over 5 min ----------
# Ratio = non-2xx requests / total requests, grouped per service. ALIGN_RATE
# normalizes to per-second so the ratio is a unitless 0..1 value; 0.05 = 5%.
resource "google_monitoring_alert_policy" "cloud_run_error_rate" {
  display_name = "Cloud Run error rate > 5%"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Non-2xx request ratio > 5% (5 min)"

    condition_threshold {
      filter             = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND metric.labels.response_code_class!=\"2xx\""
      denominator_filter = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\""

      comparison      = "COMPARISON_GT"
      threshold_value = 0.05
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.labels.service_name"]
      }

      denominator_aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.labels.service_name"]
      }
    }
  }

  notification_channels = [data.google_monitoring_notification_channel.slack.name]
}

# ---------- Alert 2: any DLQ topic received a message (immediate) ----------
# Fires when Pub/Sub publishes a failed message into one of the .dlq topics
# defined in pubsub.tf. Filter matches by resource.labels.topic_id suffix.
# duration=0s means "fire on the first alignment-period that crosses threshold"
# (effectively within ~1 min of the first DLQ write).
resource "google_monitoring_alert_policy" "dlq_message_received" {
  display_name = "DLQ topic received a message"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Any .dlq topic publish > 0"

    condition_threshold {
      filter = "metric.type=\"pubsub.googleapis.com/topic/send_message_operation_count\" AND resource.type=\"pubsub_topic\" AND resource.labels.topic_id=monitoring.regex.full_match(\".+\\\\.dlq\")"

      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.labels.topic_id"]
      }
    }
  }

  notification_channels = [data.google_monitoring_notification_channel.slack.name]
}

# ---------- Alert 3: Cloud Run instance count > 4 (approaching max=5) ----------
# The cloud-run-agent module sets max_instances=5 by default. Firing at 4
# means "next request might queue" rather than "we're already throttled".
resource "google_monitoring_alert_policy" "cloud_run_instance_count" {
  display_name = "Cloud Run instance count approaching max"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Instance count > 4 for 5 min"

    condition_threshold {
      filter = "metric.type=\"run.googleapis.com/container/instance_count\" AND resource.type=\"cloud_run_revision\""

      comparison      = "COMPARISON_GT"
      threshold_value = 4
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.labels.service_name"]
      }
    }
  }

  notification_channels = [data.google_monitoring_notification_channel.slack.name]
}
