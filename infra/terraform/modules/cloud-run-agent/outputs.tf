output "service_name" {
  value       = google_cloud_run_v2_service.agent.name
  description = "Cloud Run service name."
}

output "service_url" {
  value       = google_cloud_run_v2_service.agent.uri
  description = "HTTPS URL of the deployed Cloud Run service."
}

output "service_account_email" {
  value       = google_service_account.agent.email
  description = "Email of the per-service service account."
}
