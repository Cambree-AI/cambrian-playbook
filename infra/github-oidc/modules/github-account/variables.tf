variable "github_repo" {
  description = "GitHub org/repo allowed in the trust policies (e.g. Cambree-AI/cambrian-playbook)"
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
