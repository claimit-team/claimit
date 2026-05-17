output "service_urls" {
  description = "HTTPS URLs of the deployed Cloud Run services, keyed by agent name."
  value = {
    ingest    = module.ingest_agent.service_url
    monitor   = module.monitor_agent.service_url
    claim     = module.claim_agent.service_url
    assistant = module.assistant_agent.service_url
  }
}

output "firebase_web_config" {
  description = "Firebase Web SDK config — paste into apps/web/.env.local"
  value = {
    apiKey            = google_apikeys_key.firebase_web.key_string
    authDomain        = "${var.project_id}.firebaseapp.com"
    projectId         = var.project_id
    storageBucket     = data.google_firebase_web_app_config.claimit_web.storage_bucket
    messagingSenderId = data.google_firebase_web_app_config.claimit_web.messaging_sender_id
    appId             = google_firebase_web_app.claimit_web.app_id
  }
  sensitive = true
}
