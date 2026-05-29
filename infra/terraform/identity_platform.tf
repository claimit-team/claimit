# Identity Platform (Firebase Auth backend) setup
# Per kickoff decision May 13, 2026 — see Attachment 2 §6
# Implements infrastructure for WS5 ticket 5.2

resource "google_project_service" "identitytoolkit" {
  project            = var.project_id
  service            = "identitytoolkit.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firebase" {
  project            = var.project_id
  service            = "firebase.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "apikeys" {
  project            = var.project_id
  service            = "apikeys.googleapis.com"
  disable_on_destroy = false
}

resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.firebase]
}

resource "google_identity_platform_config" "default" {
  project = var.project_id

  authorized_domains = [
    "localhost",
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
    "claimitai.vercel.app",
  ]

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = false
      password_required = false
    }
  }

  depends_on = [google_project_service.identitytoolkit]
}

data "google_secret_manager_secret_version" "ip_oauth_client_id" {
  secret  = "identity-platform-oauth-client-id"
  project = var.project_id
}

data "google_secret_manager_secret_version" "ip_oauth_client_secret" {
  secret  = "identity-platform-oauth-client-secret"
  project = var.project_id
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  project       = var.project_id
  idp_id        = "google.com"
  enabled       = true
  client_id     = data.google_secret_manager_secret_version.ip_oauth_client_id.secret_data
  client_secret = data.google_secret_manager_secret_version.ip_oauth_client_secret.secret_data

  depends_on = [google_identity_platform_config.default]
}

resource "google_firebase_web_app" "claimit_web" {
  provider     = google-beta
  project      = var.project_id
  display_name = "ClaimIt Web"

  depends_on = [
    google_project_service.firebase,
    google_firebase_project.default,
  ]
}

data "google_firebase_web_app_config" "claimit_web" {
  provider   = google-beta
  web_app_id = google_firebase_web_app.claimit_web.app_id
}

resource "google_apikeys_key" "firebase_web" {
  project      = var.project_id
  name         = "claimit-firebase-web-key"
  display_name = "ClaimIt Firebase Web SDK"

  restrictions {
    api_targets {
      service = "identitytoolkit.googleapis.com"
    }
    api_targets {
      service = "firebase.googleapis.com"
    }
    # Required for ID-token refresh. The Firebase Web SDK silently calls
    # securetoken.googleapis.com/v1/token (granttoken) ~hourly to mint a
    # new ID token from the stored refresh_token. Omitting this from the
    # API-targets allowlist breaks every authenticated API call ~1h after
    # sign-in (BUG-33).
    api_targets {
      service = "securetoken.googleapis.com"
    }

    browser_key_restrictions {
      allowed_referrers = [
        "http://localhost/*",
        "http://localhost:3000/*",
        "https://${var.project_id}.firebaseapp.com/*",
        "https://claimitai.vercel.app/*",
        "https://*.vercel.app/*",
      ]
    }
  }

  depends_on = [
    google_project_service.firebase,
    google_project_service.apikeys,
  ]
}
