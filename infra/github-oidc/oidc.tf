# Providers cannot be for_each'd, so the per-account module is instantiated
# once per member account with an explicit provider.

module "dev" {
  source    = "./modules/github-account"
  providers = { aws = aws.dev }

  github_repo        = var.github_repo
  env_slug           = "dev"
  github_environment = var.accounts["dev"].github_environment
}

module "staging" {
  source    = "./modules/github-account"
  providers = { aws = aws.staging }

  github_repo        = var.github_repo
  env_slug           = "staging"
  github_environment = var.accounts["staging"].github_environment
}

module "prod" {
  source    = "./modules/github-account"
  providers = { aws = aws.prod }

  github_repo        = var.github_repo
  env_slug           = "prod"
  github_environment = var.accounts["prod"].github_environment
}
