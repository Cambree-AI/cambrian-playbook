# dev environment layer — account 405034826234 (cambree-dev).
# Applied by CI (GitHub Actions OIDC, .github/workflows/terraform.yml) on
# merge to the `dev` branch; bootstrapped once locally via
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
    bucket       = "cambree-dev-terraform-state-405034826234"
    key          = "env/terraform.tfstate"
    region       = "us-east-2"
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-2"

  # Hard guard: refuse to plan/apply against any account but cambree-dev,
  # whatever credentials this runs under.
  allowed_account_ids = ["405034826234"]

  default_tags {
    tags = {
      Env       = "dev"
      ManagedBy = "terraform"
      Repo      = "Cambree-AI/cambrian-playbook"
    }
  }
}
