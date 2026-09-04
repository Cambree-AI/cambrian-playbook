# Amplify Hosting for the Vite SPA (issue #82, migration Phase 2).
#
# One app per AWS account, building exactly one branch - the account's
# environment branch (dev/staging/main) - preserving the account-isolation
# model from issue #9. Rewrites are ported from vercel.json; security
# headers live in customHttp.yml at the repo root (the aws provider does
# not expose Amplify custom headers, and the YAML travels with the code).

resource "aws_amplify_app" "this" {
  name       = var.app_name
  repository = var.repository_url
  platform   = "WEB"

  # GitHub PAT used only to register the repo webhook + read access at
  # create/rotation time (see README.md). CI injects it via
  # TF_VAR_amplify_github_token; an unset Actions secret arrives as "" and
  # must become null so AWS never sees an empty token.
  access_token = var.github_access_token == "" ? null : var.github_access_token

  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - nvm install 20
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: dist
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
  EOT

  # Rewrites ported from vercel.json. Order matters: explicit rewrites
  # first, SPA fallback last.
  custom_rule {
    source = "/privacy"
    target = "/privacy.html"
    status = "200"
  }

  custom_rule {
    source = "/terms"
    target = "/terms.html"
    status = "200"
  }

  custom_rule {
    source = "/support"
    target = "/support.html"
    status = "200"
  }

  custom_rule {
    source = "/user-guide"
    target = "/cambree-user-guide.pdf"
    status = "200"
  }

  # SPA fallback: anything that is not a static asset (by extension) serves
  # index.html. html/pdf stay excluded so /privacy.html and the user guide
  # are served directly, matching Vercel behavior.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|json|map|mp4|pdf|png|svg|ttf|txt|webp|webmanifest|woff|woff2|xml|html)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }

  lifecycle {
    # The API never returns the token, and applies without the secret set
    # must not try to clear it.
    ignore_changes = [access_token]
  }
}

resource "aws_amplify_branch" "this" {
  app_id      = aws_amplify_app.this.id
  branch_name = var.branch_name
  stage       = var.branch_stage
  framework   = "React"

  enable_auto_build = true

  # Client-side (VITE_*) values only - Vite bakes these into the public
  # bundle. Server secrets (ANTHROPIC_API_KEY etc.) must NEVER appear here;
  # the v100 proxy rule stands.
  environment_variables = var.environment_variables
}
