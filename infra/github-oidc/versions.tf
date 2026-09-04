# GitHub OIDC layer — runs ONLY locally as the management account (378656858124),
# assuming OrganizationAccountAccessRole into each member account.
# See README.md for why this layer is excluded from CI.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Shares the org layer's state bucket (both layers are mgmt-run); the key
  # keeps their states separate.
  backend "s3" {
    bucket       = "cambree-org-terraform-state-378656858124"
    key          = "github-oidc/terraform.tfstate"
    region       = "us-east-2"
    use_lockfile = true # S3-native locking (Terraform >= 1.10) — no DynamoDB table
  }
}
