# IAM Identity Center: the AdministratorAccess permission set and its
# assignment to the admin user across all four accounts.
#
# The instance itself and the admin user were created in the console —
# enabling Identity Center and creating identity-store users are the two
# pieces Terraform does not manage here (users would need a full
# aws_identitystore_user resource incl. profile attributes; not worth it
# for one human). Both are referenced by data source instead.

data "aws_ssoadmin_instances" "this" {}

locals {
  sso_instance_arn  = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  identity_store_id = tolist(data.aws_ssoadmin_instances.this.identity_store_ids)[0]

  # Every account the admin user can assume into: management + members.
  all_account_ids = merge(
    { management = data.aws_caller_identity.current.account_id },
    { for env, acct in aws_organizations_account.env : env => acct.id },
  )
}

data "aws_identitystore_user" "admin" {
  identity_store_id = local.identity_store_id

  alternate_identifier {
    unique_attribute {
      attribute_path  = "UserName"
      attribute_value = "admin"
    }
  }
}

resource "aws_ssoadmin_permission_set" "admin" {
  name             = "AdministratorAccess"
  description      = "Full admin - day-to-day access, replaces root usage"
  instance_arn     = local.sso_instance_arn
  session_duration = "PT8H"
}

resource "aws_ssoadmin_managed_policy_attachment" "admin" {
  instance_arn       = local.sso_instance_arn
  managed_policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
  permission_set_arn = aws_ssoadmin_permission_set.admin.arn
}

resource "aws_ssoadmin_account_assignment" "admin" {
  for_each = local.all_account_ids

  instance_arn       = local.sso_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.admin.arn

  principal_id   = data.aws_identitystore_user.admin.user_id
  principal_type = "USER"

  target_id   = each.value
  target_type = "AWS_ACCOUNT"
}

# Billing: view + manage billing (payment methods, budgets, Cost Explorer).
# Assigned to the management account only - consolidated billing means the
# whole org's charges live there. Requires the root-only "IAM user and role
# access to Billing information" toggle on the management account (done
# 2026-08-18) or the Billing console stays blank regardless of policy.

data "aws_identitystore_user" "joe_galano" {
  identity_store_id = local.identity_store_id

  alternate_identifier {
    unique_attribute {
      attribute_path  = "UserName"
      attribute_value = "joe.galano"
    }
  }
}

resource "aws_ssoadmin_permission_set" "billing" {
  name             = "Billing"
  description      = "View and manage billing in the management account"
  instance_arn     = local.sso_instance_arn
  session_duration = "PT8H"
}

resource "aws_ssoadmin_managed_policy_attachment" "billing" {
  instance_arn       = local.sso_instance_arn
  managed_policy_arn = "arn:aws:iam::aws:policy/job-function/Billing"
  permission_set_arn = aws_ssoadmin_permission_set.billing.arn
}

resource "aws_ssoadmin_account_assignment" "billing_joe_galano" {
  instance_arn       = local.sso_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.billing.arn

  principal_id   = data.aws_identitystore_user.joe_galano.user_id
  principal_type = "USER"

  target_id   = data.aws_caller_identity.current.account_id
  target_type = "AWS_ACCOUNT"
}
