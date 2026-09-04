output "organization_id" {
  description = "AWS Organization id (o-...)"
  value       = aws_organizations_organization.org.id
}

output "workloads_ou_id" {
  description = "OU containing the dev/staging/production accounts"
  value       = aws_organizations_organizational_unit.workloads.id
}

output "account_ids" {
  description = "env => account id, for the per-env workload layers and CI role ARNs"
  value       = { for env, acct in aws_organizations_account.env : env => acct.id }
}

output "bootstrap_role_arns" {
  description = "Cross-account bootstrap role in each member account"
  value = {
    for env, acct in aws_organizations_account.env :
    env => "arn:aws:iam::${acct.id}:role/OrganizationAccountAccessRole"
  }
}
