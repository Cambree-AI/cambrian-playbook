# Org-management layer — runs ONLY as the management account (378656858124).
# See README.md for bootstrap order and the guardrails on destroying anything here.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Bootstrap: first apply runs with local state. After the state bucket
  # exists (created by this module), uncomment and run:
  #   terraform init -migrate-state
  #
  # backend "s3" {
  #   bucket       = "cambree-org-terraform-state-378656858124"
  #   key          = "org/terraform.tfstate"
  #   region       = "us-east-2"
  #   use_lockfile = true # S3-native locking (Terraform >= 1.10) — no DynamoDB table
  # }
}

provider "aws" {
  region = var.region

  # Hard guard: this layer creates the organization itself, so running it with
  # the wrong credentials would parent the org/OU/accounts under a foreign
  # management account. Refuse to plan/apply as anyone but Cambree AI.
  allowed_account_ids = ["378656858124"]

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Layer     = "org"
      Repo      = "Cambree-AI/cambrian-playbook"
    }
  }
}
