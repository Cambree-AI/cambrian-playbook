# infra/modules/api — API platform for the Vercel -> AWS function migration
# (issue #86): API Gateway HTTP API + one Lambda per endpoint + Secrets
# Manager container + CloudWatch logs. See README.md in this directory.

variable "env" {
  description = "Environment name (dev | staging | prod). Also exported to Lambdas as CAMBREE_ENV, which the shared guard uses for its production fail-closed behavior."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, staging, prod."
  }
}

variable "name_prefix" {
  description = "Prefix for resource names and the secret path."
  type        = string
  default     = "cambree"
}

variable "dist_dir" {
  description = "Path to api-aws/dist, produced by `npm run build` in api-aws/ (CI does this before plan/apply). Each endpoint key must have a matching dist/<name>/ directory."
  type        = string
}

variable "endpoints" {
  description = "Endpoints to deploy, keyed by name; each becomes a Lambda routed at /api/<name>. Keys must match api-aws/<name>/ source directories."
  type = map(object({
    timeout_seconds = optional(number, 10)
    memory_mb       = optional(number, 256)
    environment     = optional(map(string), {})
  }))
}

variable "common_environment" {
  description = "Plaintext environment variables set on every Lambda (public config only - secrets go in the Secrets Manager container, never here: this map lands in state)."
  type        = map(string)
  default     = {}
}

variable "throttling_rate_limit" {
  description = "Steady-state requests/second across the stage (replaces the Vercel in-memory per-IP limiter as the baseline; per-user usage plans are the Phase 8 follow-up)."
  type        = number
  default     = 25
}

variable "throttling_burst_limit" {
  description = "Burst capacity for the stage."
  type        = number
  default     = 100
}

variable "log_retention_days" {
  description = "CloudWatch retention for Lambda and API access logs."
  type        = number
  default     = 30
}
