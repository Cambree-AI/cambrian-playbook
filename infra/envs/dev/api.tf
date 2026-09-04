# API platform - dev (issue #86): API Gateway HTTP API + Lambda endpoints.
# Pilot endpoint: contact. CI builds api-aws/dist before plan/apply
# (.github/workflows/terraform.yml).

module "api" {
  source = "../../modules/api"

  env      = "dev"
  dist_dir = "${path.module}/../../../api-aws/dist"

  endpoints = {
    contact = {}
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
