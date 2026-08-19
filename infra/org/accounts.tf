# Member accounts: dev / staging / production under the workloads OU.
#
# Accounts are pets, not cattle:
# - Root emails must be globally unique across ALL of AWS; changing one later
#   is a manual console + email-confirmation flow.
# - Closing an account triggers a 90-day suspension; the email stays burned
#   until that completes. Hence prevent_destroy and close_on_deletion = false.
# - If an account was console-created first, import it (expect a benign
#   permanent diff on role_name - the API cannot read it back):
#     terraform import 'aws_organizations_account.env["dev"]' <account-id>

resource "aws_organizations_account" "env" {
  for_each = local.member_accounts

  name      = "cambree-${each.key}"
  email     = each.value
  parent_id = aws_organizations_organizational_unit.workloads.id

  # Auto-created role the management account (and Terraform) assumes to
  # bootstrap each member account before any other IAM exists there.
  role_name = "OrganizationAccountAccessRole"

  close_on_deletion = false

  lifecycle {
    prevent_destroy = true
    # role_name/email cannot be verified via the API after creation
    ignore_changes = [role_name]
  }
}
