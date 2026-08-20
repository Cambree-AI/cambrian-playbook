variable "region" {
  description = "Region for the aliased member-account providers. IAM is global; this only anchors the API endpoints."
  type        = string
  default     = "us-east-2"
}

variable "github_repo" {
  description = "GitHub org/repo whose Actions jobs may assume the roles. Part of every trust policy."
  type        = string
  default     = "Cambree-AI/cambrian-playbook"
}

variable "accounts" {
  description = <<-EOT
    env slug => member account. Ids from infra/org `account_ids` output.
    - The slug (dev/staging/prod) names the infra/envs/<slug> directory and its
      state bucket cambree-<slug>-terraform-state-<id>.
    - github_environment is the GitHub Environment name bound into the deploy
      role's trust policy (note: prod's is "production", not "prod").
  EOT
  type = map(object({
    id                 = string
    github_environment = string
  }))
  default = {
    dev     = { id = "405034826234", github_environment = "dev" }
    staging = { id = "865526619955", github_environment = "staging" }
    prod    = { id = "062560095244", github_environment = "production" }
  }
}

locals {
  default_tags = {
    ManagedBy = "terraform"
    Layer     = "github-oidc"
    Repo      = "Cambree-AI/cambrian-playbook"
  }
}
