# Baseline guardrails, attached to the workloads OU only - NEVER to the root
# or the management account (SCPs do not apply to the management account
# anyway, but attaching restrictive policies at the root risks locking the
# bootstrap path out of member accounts).

# 1. Member accounts cannot remove themselves from the organization.
resource "aws_organizations_policy" "deny_leave_org" {
  name        = "deny-leave-organization"
  description = "Member accounts cannot leave the organization"
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "DenyLeaveOrg"
      Effect   = "Deny"
      Action   = "organizations:LeaveOrganization"
      Resource = "*"
    }]
  })
}

# 2. Root user in member accounts is break-glass only: deny all actions.
#    Recovery still works (password reset is an auth flow, not an API action),
#    and the management account retains OrganizationAccountAccessRole access.
resource "aws_organizations_policy" "deny_member_root" {
  name        = "deny-member-root-user"
  description = "Deny all actions taken as the root user of member accounts"
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "DenyRootUser"
      Effect   = "Deny"
      Action   = "*"
      Resource = "*"
      Condition = {
        StringLike = { "aws:PrincipalArn" = "arn:aws:iam::*:root" }
      }
    }]
  })
}

# 3. Region restriction: deny everything outside allowed_regions except
#    global services (which always report us-east-1 or no region).
#    Review the NotAction list when adopting a new global service.
resource "aws_organizations_policy" "region_restriction" {
  name        = "restrict-regions"
  description = "Deny non-global actions outside the allowed regions"
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "DenyOutsideAllowedRegions"
      Effect = "Deny"
      NotAction = [
        "iam:*",
        "organizations:*",
        "sts:*",
        "account:*",
        "route53:*",
        "route53domains:*",
        "cloudfront:*",
        "support:*",
        "budgets:*",
        "ce:*",
        "health:*",
        "trustedadvisor:*",
      ]
      Resource = "*"
      Condition = {
        StringNotEquals = { "aws:RequestedRegion" = var.allowed_regions }
      }
    }]
  })
}

resource "aws_organizations_policy_attachment" "workloads" {
  for_each = {
    deny_leave_org     = aws_organizations_policy.deny_leave_org.id
    deny_member_root   = aws_organizations_policy.deny_member_root.id
    region_restriction = aws_organizations_policy.region_restriction.id
  }

  policy_id = each.value
  target_id = aws_organizations_organizational_unit.workloads.id
}
