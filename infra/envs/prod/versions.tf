# prod environment layer — account 062560095244 (cambree-production).
# Applied by CI (GitHub Actions OIDC, .github/workflows/terraform.yml) on
# merge to the `main` branch, gated by the `production` GitHub Environment's
# required-reviewer approval; bootstrapped once locally via
# OrganizationAccountAccessRole (see infra/github-oidc/README.md).

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Bucket is created by state.tf in this same layer. Bootstrap done
  # 2026-08-20: first apply ran with local state, then state was migrated
  # here via `terraform init -migrate-state`.
  backend "s3" {
    bucket       = "cambree-prod-terraform-state-062560095244"
    key          = "env/terraform.tfstate"
    region       = "us-east-2"
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-2"

  # Hard guard: refuse to plan/apply against any account but cambree-production,
  # whatever credentials this runs under.
  allowed_account_ids = ["062560095244"]

  default_tags {
    tags = {
      Env       = "prod"
      ManagedBy = "terraform"
      Repo      = "Cambree-AI/cambrian-playbook"
    }
  }
}
