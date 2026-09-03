// api-aws/shared/secrets.js
/* global process */
//
// Cold-start secret loading (issue #86). Terraform creates the per-env secret
// CONTAINER only (cambree/<env>/api-env) — the value is set once, out of band,
// via `aws secretsmanager put-secret-value` (see api-aws/README.md), so secret
// values never exist in git or Terraform state.
//
// The secret value is a single JSON object mirroring the server-side Vercel
// env vars, e.g. {"SUPABASE_SERVICE_KEY":"...","SUPABASE_JWT_SECRET":"..."}.
// Lambdas receive the container's ARN as SECRETS_ARN; on first invocation we
// fetch it, merge the keys into process.env (existing env vars win, so
// Terraform-set plaintext config is never overridden), and cache for the
// instance lifetime.
//
// The SDK client is a runtime-provided module (nodejs22.x bundles AWS SDK v3);
// esbuild marks @aws-sdk/* external so it is never packaged. Imported
// dynamically, and only when SECRETS_ARN is set, so local tests (no SDK
// installed) can exercise handlers without it.

let loaded = null; // Promise — concurrent cold-start invocations share one fetch

export function loadSecrets() {
  if (loaded) return loaded;
  loaded = (async () => {
    const arn = process.env.SECRETS_ARN;
    if (!arn) {
      console.warn("[secrets] SECRETS_ARN not set — running on plain env vars only");
      return {};
    }
    const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const client = new SecretsManagerClient({});
    const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
    let parsed = {};
    try { parsed = JSON.parse(out.SecretString || "{}"); } catch {
      console.error("[secrets] secret value is not valid JSON — ignoring");
      return {};
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined && typeof v === "string") process.env[k] = v;
    }
    return parsed;
  })().catch((e) => {
    // Fail open to plain env vars: endpoints that don't need any secret
    // (e.g. a health check) keep working; ones that do will error clearly.
    console.error("[secrets] load failed:", e?.message || e);
    loaded = null; // allow retry on next invocation
    return {};
  });
  return loaded;
}
