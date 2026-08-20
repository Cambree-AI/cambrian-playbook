# Per-member-account GitHub OIDC wiring: the identity provider plus the two
# roles CI assumes. The trust policies — not workflow YAML — are what enforce
# the branch/environment => account mapping (issue #73).

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_caller_identity" "current" {}

# --- Identity provider -------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS validates GitHub's cert against its trusted-CA library and ignores the
  # thumbprint for this provider; the argument is still required, so pin the
  # two historical GitHub root thumbprints (per aws-actions/configure-aws-credentials).
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

# --- github-plan: read-only, assumed by pull_request jobs --------------------

# PR-triggered jobs run code from unreviewed branches, so they get no write
# access beyond the state lockfile. Any pull_request job in the repo can plan
# any env — that is intentional; plans are read-only.
data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:pull_request"]
    }
  }
}

resource "aws_iam_role" "plan" {
  name               = "github-plan"
  description        = "Read-only role for Terraform plan on pull requests (GitHub OIDC)"
  assume_role_policy = data.aws_iam_policy_document.plan_trust.json
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# `terraform plan` against an S3 backend with use_lockfile must create and
# delete the .tflock object; ReadOnlyAccess covers everything else it needs.
data "aws_iam_policy_document" "plan_state_lock" {
  statement {
    sid = "StateObjectReadWrite"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "arn:aws:s3:::cambree-${var.env_slug}-terraform-state-${data.aws_caller_identity.current.account_id}/*",
    ]
  }
}

resource "aws_iam_role_policy" "plan_state_lock" {
  name   = "terraform-state-lock"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan_state_lock.json
}

# --- github-deploy: admin, assumed only by environment-bound apply jobs ------

# A job bound to a GitHub Environment presents sub
# "repo:<repo>:environment:<name>" (NOT the ref) — so this role is only
# reachable through that environment's protection rules (production: required
# reviewer + main-only deployment branches).
data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "github-deploy"
  description        = "Terraform apply role for merges deploying the ${var.github_environment} environment (GitHub OIDC)"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
}

# AdministratorAccess until the env layers have real resource shapes
# (tightening is an explicit follow-up in issue #73's out-of-scope list).
resource "aws_iam_role_policy_attachment" "deploy_admin" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
