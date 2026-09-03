# Amplify Hosting - dev account builds the `dev` branch (issue #82).

variable "amplify_github_token" {
  description = "GitHub PAT for the Amplify repo connection; CI injects it from the AMPLIFY_GITHUB_TOKEN Actions secret. See infra/modules/amplify/README.md."
  type        = string
  default     = null
  sensitive   = true
}

variable "vite_supabase_url" {
  description = "Supabase project URL (public; same project across envs - staging/dev share production Supabase). Fill in amplify.auto.tfvars from Vercel project settings."
  type        = string
  default     = ""
}

variable "vite_supabase_anon_key" {
  description = "Supabase anon key (public by design). Fill in amplify.auto.tfvars."
  type        = string
  default     = ""
}

variable "vite_app_url" {
  description = "Public app URL baked into the bundle. Pre-domains (#84) this is the Amplify default branch URL, known after first apply - set it then."
  type        = string
  default     = ""
}

variable "vite_api_url" {
  description = "Origin the SPA calls for /api/* (issue #83). Empty = same-origin relative paths."
  type        = string
  default     = ""
}

variable "vite_api_endpoint_origins" {
  description = "Per-endpoint origin overrides as a JSON object (issue #86), e.g. {\"/api/contact\":\"<api_endpoint output>\"}. Endpoints not listed keep using vite_api_url. Empty = no overrides."
  type        = string
  default     = ""
}

module "amplify" {
  source = "../../modules/amplify"

  app_name            = "cambree-catalyst-dev"
  branch_name         = "dev"
  branch_stage        = "DEVELOPMENT"
  github_access_token = var.amplify_github_token

  environment_variables = {
    VITE_SUPABASE_URL         = var.vite_supabase_url
    VITE_SUPABASE_ANON_KEY    = var.vite_supabase_anon_key
    VITE_APP_URL              = var.vite_app_url
    VITE_API_URL              = var.vite_api_url
    VITE_API_ENDPOINT_ORIGINS = var.vite_api_endpoint_origins
  }
}

output "amplify_app_id" {
  description = "Amplify app id (record in docs/aws-migration-plan.md)"
  value       = module.amplify.app_id
}

output "amplify_branch_url" {
  description = "Where the dev SPA serves"
  value       = module.amplify.branch_url
}
