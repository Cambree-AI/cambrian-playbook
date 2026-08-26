variable "app_name" {
  description = "Amplify app name (one app per account/environment)"
  type        = string
}

variable "repository_url" {
  description = "HTTPS URL of the GitHub repository Amplify builds from"
  type        = string
  default     = "https://github.com/Cambree-AI/cambrian-playbook"
}

variable "branch_name" {
  description = "The single git branch this account's app builds (dev/staging/main)"
  type        = string
}

variable "branch_stage" {
  description = "Amplify stage label for the branch"
  type        = string
  default     = "PRODUCTION"

  validation {
    condition     = contains(["PRODUCTION", "BETA", "DEVELOPMENT", "EXPERIMENTAL"], var.branch_stage)
    error_message = "branch_stage must be one of PRODUCTION, BETA, DEVELOPMENT, EXPERIMENTAL."
  }
}

variable "github_access_token" {
  description = "GitHub PAT for repo webhook registration; injected by CI as TF_VAR_amplify_github_token, only needed when creating the app or rotating the connection. See README.md."
  type        = string
  default     = null
  sensitive   = true
}

variable "environment_variables" {
  description = "Branch build env vars. Client-safe VITE_* values ONLY - these are baked into the public bundle."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for k in keys(var.environment_variables) : startswith(k, "VITE_")])
    error_message = "Only VITE_-prefixed (client-safe) variables are allowed; server secrets never go into Amplify env vars."
  }
}
