variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "GCP region for the Cloud Run service."
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name (e.g. claimit-ingest-agent). Also used as the per-service service-account id, so must be <= 30 chars and match GCP SA id rules."

  validation {
    condition     = length(var.service_name) <= 30 && can(regex("^[a-z][-a-z0-9]{4,28}[a-z0-9]$", var.service_name))
    error_message = "service_name must be 6-30 chars, lowercase alphanumeric + hyphens, start with a letter and end with a letter or digit."
  }
}

variable "image" {
  type        = string
  description = "Container image URL (registry/repo/name:tag or @digest)."
}

variable "memory_limit" {
  type        = string
  description = "Container memory limit (e.g. 1Gi, 2Gi)."
  default     = "1Gi"
}

variable "cpu_limit" {
  type        = string
  description = "Container CPU limit (e.g. 1, 2)."
  default     = "1"
}

variable "timeout_seconds" {
  type        = number
  description = "Request timeout in seconds."
  default     = 300
}

variable "min_instances" {
  type        = number
  description = "Minimum instance count (0 = scale to zero)."
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Maximum instance count."
  default     = 5
}

variable "container_port" {
  type        = number
  description = "Port the container listens on. Cloud Run injects PORT env var matching this."
  default     = 8080
}

variable "secret_ids" {
  type        = list(string)
  description = "Secret Manager secret IDs the service account should be granted secretAccessor on."
  default     = []
}

variable "secret_env_map" {
  type        = map(string)
  description = "Map of ENV_VAR_NAME => secret-manager-secret-id. Each entry is mounted into the container as an env var sourced from Secret Manager (version=latest)."
  default     = {}
}

variable "deletion_protection" {
  type        = bool
  description = "Whether the Cloud Run service is protected from accidental deletion."
  default     = true
}

variable "env_vars" {
  type        = map(string)
  description = "Plain (non-secret) environment variables to inject into the container."
  default     = {}
}

variable "probe_type" {
  type        = string
  description = "Startup + liveness probe transport: 'http' (HTTP GET at probe_path) or 'tcp' (TCP connect to container_port). Default 'http' matches every existing consumer."
  default     = "http"

  validation {
    condition     = contains(["http", "tcp"], var.probe_type)
    error_message = "probe_type must be 'http' or 'tcp'."
  }
}

variable "probe_path" {
  type        = string
  description = "HTTP path used by startup + liveness probes when probe_type='http'. Ignored when probe_type='tcp'."
  default     = "/health"
}
