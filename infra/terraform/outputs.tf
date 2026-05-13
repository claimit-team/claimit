output "service_urls" {
  description = "HTTPS URLs of the deployed Cloud Run services, keyed by agent name."
  value = {
    ingest    = module.ingest_agent.service_url
    monitor   = module.monitor_agent.service_url
    claim     = module.claim_agent.service_url
    assistant = module.assistant_agent.service_url
  }
}
