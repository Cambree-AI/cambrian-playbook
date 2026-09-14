# API platform - prod (issue #86): API Gateway HTTP API + Lambda endpoints.
# Endpoints: contact (pilot, issue #86); knowledge, enrich-free,
# request-access, invite (utility ports, issue #87). CI builds api-aws/dist before plan/apply
# (.github/workflows/terraform.yml); the apply is gated by the production
# GitHub Environment's required-reviewer approval like every prod change.

module "api" {
  source = "../../modules/api"

  env      = "prod"
  dist_dir = "${path.module}/../../../api-aws/dist"

  endpoints = {
    contact = {}
    # 30s: knowledge waits on JWKS + two Supabase reads; enrich-free fans out
    # to SEC EDGAR + Wikidata SPARQL (slow upstreams, no keys).
    knowledge     = { timeout_seconds = 30 }
    "enrich-free" = { timeout_seconds = 30 }
    # 30s: request-access chains promo RPCs + provisioning + Resend emails;
    # invite chains several Supabase REST/auth calls.
    "request-access" = { timeout_seconds = 30 }
    invite           = { timeout_seconds = 30 }
  }

  common_environment = {
    # Public by design (same value the SPA bundles); the service key comes
    # from the Secrets Manager container, never from here.
    SUPABASE_URL = var.vite_supabase_url
  }
}

output "api_endpoint" {
  description = "Invoke URL for the prod API Lambdas (endpoint-origin map value for the SPA)"
  value       = module.api.api_endpoint
}

output "api_secret_name" {
  description = "Secrets Manager container to fill once via put-secret-value (api-aws/README.md)"
  value       = module.api.secret_name
}
