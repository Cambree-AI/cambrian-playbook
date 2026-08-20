variable "github_sub_prefix" {
  description = "Subject-claim prefix the trust policies exact-match, in GitHub's immutable-id form (repo:ORG@orgid/REPO@repoid)"
  type        = string
}

variable "env_slug" {
  description = "infra/envs/<slug> directory name; also names the state bucket cambree-<slug>-terraform-state-<account-id>"
  type        = string
}

variable "github_environment" {
  description = "GitHub Environment name the deploy role trusts (dev/staging/production)"
  type        = string
}
