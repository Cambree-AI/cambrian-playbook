# amplify module

Amplify Hosting for the SPA - one app per account, building that account's
environment branch (`dev` / `staging` / `main`). Instantiated from each
`infra/envs/*` root and applied only by the Terraform CI pipeline (issue #73).
Issue #82; background in docs/aws-migration-plan.md §1/§8 Phase 2.

Security headers are NOT in Terraform: Amplify reads them from
[`customHttp.yml`](../../../customHttp.yml) at the repo root on every deploy
(the aws provider has no custom-headers argument). Header changes are code
changes, reviewed like any other.

## One-time manual setup (before the first apply per account)

1. **Install the AWS Amplify GitHub App** for the target AWS account's
   region when prompted by the connection flow, granting it access to
   `Cambree-AI/cambrian-playbook` only.
2. **Create a GitHub fine-grained PAT** scoped to this repository with
   Contents: read-only, Metadata: read-only, and Webhooks: read and write.
   (Classic-PAT fallback: `repo` + `admin:repo_hook`.) Amplify uses it once
   to register the build webhook and read the repo; it is not needed after
   app creation.
3. **Store it as the GitHub Actions secret `AMPLIFY_GITHUB_TOKEN`**
   (repository-level). The workflow injects it as
   `TF_VAR_amplify_github_token`. This is a GitHub credential, not an AWS
   one - the "no AWS keys in GitHub" rule (issue #73) still holds.
4. After all three apps exist the secret can be rotated or removed; applies
   with the variable unset are no-ops on the connection
   (`ignore_changes = [access_token]`).

## Environment variables

`environment_variables` accepts **client-safe `VITE_*` values only** (module
validation enforces the prefix). Vite bakes them into the public bundle:
the Supabase URL + anon key are designed to be public; **no server secret
(`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_KEY`, ...) may ever be set here.**
Fill the values in each env root's `amplify.auto.tfvars` from the Vercel
project settings before merging.

## Post-create console step (per app, once)

Apps created via the PAT flow show **"Update required"** in the Amplify
console: open the app and click through the Git-connection migration to the
GitHub App (already installed org-wide). Until this is done, webhook builds
may not trigger. Also: the first build never runs automatically for
API-created branches (start one release), and branch env-var changes need a
release to be baked into the bundle.
