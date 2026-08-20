# One aliased provider per member account, entered via the bootstrap role the
# org layer created. Credentials must be the management account (cambree-mgmt);
# allowed_account_ids makes each alias refuse to touch any other account even
# if the assume_role somehow resolved elsewhere.

provider "aws" {
  alias  = "dev"
  region = var.region

  assume_role {
    role_arn = "arn:aws:iam::${var.accounts["dev"].id}:role/OrganizationAccountAccessRole"
  }
  allowed_account_ids = [var.accounts["dev"].id]

  default_tags {
    tags = local.default_tags
  }
}

provider "aws" {
  alias  = "staging"
  region = var.region

  assume_role {
    role_arn = "arn:aws:iam::${var.accounts["staging"].id}:role/OrganizationAccountAccessRole"
  }
  allowed_account_ids = [var.accounts["staging"].id]

  default_tags {
    tags = local.default_tags
  }
}

provider "aws" {
  alias  = "prod"
  region = var.region

  assume_role {
    role_arn = "arn:aws:iam::${var.accounts["prod"].id}:role/OrganizationAccountAccessRole"
  }
  allowed_account_ids = [var.accounts["prod"].id]

  default_tags {
    tags = local.default_tags
  }
}
