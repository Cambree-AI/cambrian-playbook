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

variable "github_org_id" {
  description = "Numeric GitHub org id (gh api orgs/Cambree-AI --jq .id). The token's sub claim uses the immutable name@id form."
  type        = string
  default     = "311088446"
}

variable "github_repo_id" {
  description = "Numeric GitHub repo id (gh api repos/... --jq .id). The token's sub claim uses the immutable name@id form."
  type        = string
  default     = "1203192265"
}

variable "accounts" {
  description = <<-EOT
    env slug => member account. Ids from infra/org `account_ids` output.
    - The slug (dev/staging/prod) names the infra/envs/<slug> directory and its
      state bucket cambree-<slug>-terraform-state-<id>.
    - github_environments are the GitHub Environment names the deploy role's
      trust policy accepts (exact-match, OR'd). Prod lists both casings:
      the workflow says "production" but GitHub matched it case-insensitively
      onto the pre-existing Vercel "Production" environment, and IAM
      StringEquals is case-sensitive — so trust whichever form the token's
      sub claim presents.
  EOT
  type = map(object({
    id                  = string
    github_environments = list(string)
  }))
  default = {
    dev     = { id = "405034826234", github_environments = ["dev"] }
    staging = { id = "865526619955", github_environments = ["staging"] }
    prod    = { id = "062560095244", github_environments = ["production", "Production"] }
  }
}

locals {
  # This repo's tokens present the immutable-id subject form
  # (repo:ORG@orgid/REPO@repoid:...), verified against a live pull_request
  # token 2026-08-20 — NOT the classic repo:ORG/REPO:... form. Ids are
  # rename-resistant, so exact-matching this form is strictly stronger.
  github_sub_prefix = format(
    "repo:%s@%s/%s@%s",
    split("/", var.github_repo)[0], var.github_org_id,
    split("/", var.github_repo)[1], var.github_repo_id,
  )

  default_tags = {
    ManagedBy = "terraform"
    Layer     = "github-oidc"
    Repo      = "Cambree-AI/cambrian-playbook"
  }
}
