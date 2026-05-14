variable "project_id" {
  type        = string
  description = "GCP project ID hosting all ClaimIt Cloud Run services."
}

variable "region" {
  type        = string
  description = "GCP region for Cloud Run services and Artifact Registry."
  default     = "us-east1"
}

variable "artifact_registry_repo" {
  type        = string
  description = "Artifact Registry Docker repository name."
  default     = "claimit"
}

# Per-service image URLs. Each defaults to GCP's public Cloud Run hello-world
# placeholder so `terraform apply` works before any real image has been pushed.
# Override after the first push to Artifact Registry.

variable "ingest_agent_image" {
  type        = string
  description = "Container image URL for the ingest agent."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "monitor_agent_image" {
  type        = string
  description = "Container image URL for the monitor agent."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "claim_agent_image" {
  type        = string
  description = "Container image URL for the claim agent."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "assistant_agent_image" {
  type        = string
  description = "Container image URL for the assistant agent."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "web_frontend_url" {
  type        = string
  description = "Base URL of the Vercel-hosted web frontend for Pub/Sub push subscriptions."
  default     = "https://claimitai.vercel.app"
}
