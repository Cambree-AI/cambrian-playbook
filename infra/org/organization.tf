# The organization + OU structure.
#
# If the org was already created outside Terraform, import instead of recreating:
#   terraform import aws_organizations_organization.org <org-id>

resource "aws_organizations_organization" "org" {
  feature_set = "ALL" # required for SCPs (not just consolidated billing)

  enabled_policy_types = ["SERVICE_CONTROL_POLICY"]

  # Grows as org-integrated services are enabled. Keep in sync with the console:
  # a service enabled there but missing here shows up as drift on the next plan.
  aws_service_access_principals = [
    "sso.amazonaws.com",        # IAM Identity Center
    "cloudtrail.amazonaws.com", # org-wide trail
  ]
}

resource "aws_organizations_organizational_unit" "workloads" {
  name      = "workloads"
  parent_id = aws_organizations_organization.org.roots[0].id
}
