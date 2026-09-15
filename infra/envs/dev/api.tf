# API platform - dev (issue #86): API Gateway HTTP API + Lambda endpoints.
# Endpoints: contact (pilot, issue #86) + the issue #87 utility ports:
# knowledge, enrich-free, request-access, invite, referral, fetch. CI builds api-aws/dist before plan/apply
# (.github/workflows/terraform.yml).

module "api" {
  source = "../../modules/api"

  env      = "dev"
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
    # referral chains several Supabase calls; fetch runs the two-stage page
    # fetch (4s plain + 12s render) — 30s matches its Vercel maxDuration.
    referral = { timeout_seconds = 15, environment = { APP_URL = var.vite_app_url } }
    fetch    = { timeout_seconds = 30 }
  }

  common_environment = {
    # Public by design (same value the SPA bundles); the service key comes
    # from the Secrets Manager container, never from here.
    SUPABASE_URL = var.vite_supabase_url
  }
}

output "api_endpoint" {
  description = "Invoke URL for the dev API Lambdas (endpoint-origin map value for the SPA)"
  value       = module.api.api_endpoint
}

output "api_secret_name" {
  description = "Secrets Manager container to fill once via put-secret-value (api-aws/README.md)"
  value       = module.api.secret_name
}
