# Role ARNs feed the GitHub repository variables AWS_PLAN_ROLE_* and
# AWS_DEPLOY_ROLE_* (issue #73 step 3).

output "plan_role_arns" {
  description = "env => read-only role assumed by pull_request plan jobs"
  value = {
    dev     = module.dev.plan_role_arn
    staging = module.staging.plan_role_arn
    prod    = module.prod.plan_role_arn
  }
}

output "deploy_role_arns" {
  description = "env => admin role assumed by environment-bound apply jobs"
  value = {
    dev     = module.dev.deploy_role_arn
    staging = module.staging.deploy_role_arn
    prod    = module.prod.deploy_role_arn
  }
}

output "oidc_provider_arns" {
  description = "env => GitHub OIDC identity provider"
  value = {
    dev     = module.dev.oidc_provider_arn
    staging = module.staging.oidc_provider_arn
    prod    = module.prod.oidc_provider_arn
  }
}
