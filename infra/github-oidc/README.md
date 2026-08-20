# infra/github-oidc — CI credential layer

Terraform for the GitHub Actions ↔ AWS OIDC federation: in each member
account (dev 405034826234, staging 865526619955, prod 062560095244) an OIDC
identity provider for `token.actions.githubusercontent.com` plus two roles:

- **`github-plan`** — read-only (`ReadOnlyAccess` + state-lockfile object
  write). Trusts `sub = repo:Cambree-AI/cambrian-playbook:pull_request`, so
  any PR job can plan any env, but can change nothing.
- **`github-deploy`** — `AdministratorAccess`. Trusts
  `sub = repo:Cambree-AI/cambrian-playbook:environment:<dev|staging|production>`,
  so it is reachable ONLY through a job bound to that GitHub Environment —
  the environment's protection rules (production: required reviewer,
  `main`-only branches) gate every apply, and the mapping is enforced by IAM,
  not workflow YAML. Issue #73; CI design discussion on issue #9.

**This layer runs ONLY from a laptop as the management account — it is
deliberately excluded from CI.** It reaches into all three member accounts
via `OrganizationAccountAccessRole`; a CI role with that reach could rewrite
the trust policies that constrain CI itself. Same reasoning as `infra/org/`
(see its README). CI applies only `infra/envs/*`.

## Bootstrap order (after infra/org, before the workflow can run)

```sh
aws login   # management account (cambree-mgmt profile)
cd infra/github-oidc
terraform init     # backend: org state bucket, key github-oidc/terraform.tfstate
terraform plan     # review: 3× (OIDC provider, github-plan, github-deploy)
terraform apply
terraform plan     # must show no changes (drift check)
terraform output   # role ARNs => GitHub repo variables AWS_PLAN_ROLE_* / AWS_DEPLOY_ROLE_*
```

No chicken-and-egg here (the org state bucket already exists), but ordering
matters: these roles must exist before `.github/workflows/terraform.yml` can
assume them, and the `infra/envs/<env>` state buckets referenced by
`github-plan`'s lockfile policy are created by each env's own bootstrap —
the policy tolerates the bucket not existing yet.

## Invariants

- Trust policies pin `aud = sts.amazonaws.com` and exact-match `sub` — no
  `StringLike` wildcards. Changing a GitHub Environment's name breaks the
  matching deploy role on purpose; update both together.
- The deploy role stays AdministratorAccess only until the env layers have
  real resource shapes; tightening is a tracked follow-up (issue #73).
- If GitHub's OIDC thumbprint guidance changes, AWS ignores the value for
  this provider anyway (trusted-CA validation); keep the two pinned
  historical thumbprints unless the provider starts erroring.
