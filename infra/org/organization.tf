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
    "iam.amazonaws.com",        # centralized root access management
  ]
}

# Centralized root access management: member-account root credentials are
# removed org-wide - no password, no MFA to manage, and password recovery is
# blocked (the deny-member-root SCP stays as defense in depth). RootSessions
# lets the management account take short-lived privileged root sessions in a
# member account for the few root-only tasks (e.g. deleting a misconfigured
# bucket policy) - the break-glass path, replacing password recovery.
resource "aws_iam_organizations_features" "root_access" {
  enabled_features = [
    "RootCredentialsManagement",
    "RootSessions",
  ]

  # Requires iam.amazonaws.com trusted access (declared on the org above) to
  # be live first; without this edge the two race on a fresh apply.
  depends_on = [aws_organizations_organization.org]
}

resource "aws_organizations_organizational_unit" "workloads" {
  name      = "workloads"
  parent_id = aws_organizations_organization.org.roots[0].id
}
