variable "github_sub_prefix" {
  description = "Subject-claim prefix the trust policies exact-match, in GitHub's immutable-id form (repo:ORG@orgid/REPO@repoid)"
  type        = string
}

variable "env_slug" {
  description = "infra/envs/<slug> directory name; also names the state bucket cambree-<slug>-terraform-state-<account-id>"
  type        = string
}

variable "github_environments" {
  description = "GitHub Environment names the deploy role trusts (exact-match, OR'd — multiple entries cover casing variants of the same environment)"
  type        = list(string)
}
