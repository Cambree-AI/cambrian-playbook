variable "region" {
  description = "Home region for org-layer resources (state bucket, CloudTrail bucket). Organizations itself is a global service."
  type        = string
  default     = "us-east-2"
}

variable "account_email_base" {
  description = "Mailbox that receives plus-addressed root email for member accounts (admin+aws-<env>@cambree.ai). Verify plus-addressing delivers BEFORE first apply - changing a root email later requires a console + email-confirmation flow."
  type        = string
  default     = "admin@cambree.ai"
}

variable "allowed_regions" {
  description = "Regions member accounts may use. us-east-2 is the default region; us-east-1 is needed for ACM-for-CloudFront, the AWS Agent Toolkit service, and some Bedrock inference profiles."
  type        = list(string)
  default     = ["us-east-2", "us-east-1"]
}

locals {
  # Member accounts: env => root email. The management account
  # (admin+aws@cambree.ai, 378656858124) already exists and is NOT managed here.
  member_accounts = {
    dev        = replace(var.account_email_base, "@", "+aws-dev@")
    staging    = replace(var.account_email_base, "@", "+aws-staging@")
    production = replace(var.account_email_base, "@", "+aws-production@")
  }
}
