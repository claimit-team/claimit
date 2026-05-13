terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Local state for the hackathon. Switch to GCS when multi-user state becomes
  # necessary:
  #
  # backend "gcs" {
  #   bucket = "claimit-tfstate"
  #   prefix = "infra"
  # }
}
