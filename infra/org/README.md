# infra/org — organization-management layer

Terraform for the AWS Organization: OU structure, the dev/staging/production
member accounts, baseline SCPs, the org-wide CloudTrail, and this layer's own
state bucket. Issue #9; background in `docs/aws-migration-plan.md`.

**This layer runs ONLY as the management account (378656858124) and ONLY from
a laptop — it is deliberately excluded from CI.** A deploy role with
org-management power is a bigger liability than the convenience is worth. The
per-environment workload layers (`infra/envs/*`, later phases) are the ones
CI applies via GitHub OIDC.

## Prerequisites (one-time, before first apply)

1. Verify plus-addressing: send test mail to `admin+aws-dev@cambree.ai` and
   confirm delivery. Root emails are near-immutable once used.
2. Sign in as the management account: `aws login --region us-east-2`.
   (Until IAM Identity Center is set up this is the root session — creating
   the Identity Center admin user is part of this issue and retires that.)

## Bootstrap order

```sh
cd infra/org
terraform init            # local state on first run
terraform plan            # review: org, OU, 3 accounts, SCPs, trail, buckets
terraform apply
# state bucket now exists — move state into it:
#   1. uncomment the backend "s3" block in versions.tf
#   2. terraform init -migrate-state
terraform plan            # must show no changes (drift check)
```

## Invariants

- Accounts are create-once: `prevent_destroy` is set and `terraform destroy`
  must never be run against this layer. Closing an account is a deliberate
  console action with a 90-day quarantine.
- SCPs attach to the `workloads` OU only — never to the org root.
- If anything here gets created in the console first, `terraform import` it;
  do not recreate. Imported accounts show a permanent benign diff on
  `role_name` (API cannot read it back); it is in `ignore_changes`.

## Manual steps Terraform cannot do

- Enable IAM Identity Center (one console click) before managing permission
  sets with `aws_ssoadmin_*` resources.
- Root-user MFA on all four accounts (member roots: password-recovery flow
  first, then MFA; they are otherwise passwordless and SCP-denied).
- Record the created account ids in `docs/aws-migration-plan.md`.
