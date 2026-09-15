#!/usr/bin/env node
/* global process */
// api-aws/build.mjs — bundles every endpoint directory into dist/<name>/index.mjs
// (issue #86). Run by CI (.github/workflows/terraform.yml) before terraform
// plan/apply; Terraform zips dist/<name>/ via archive_file.
//
// Each subdirectory of api-aws/ containing index.js is an endpoint. shared/
// is bundled INTO each output (decision: bundled module, not a Lambda layer —
// api-aws/README.md). @aws-sdk/* stays external: nodejs22.x ships SDK v3.

import { build } from "esbuild";
import { readdirSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const endpoints = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !["shared", "dist", "node_modules"].includes(d.name))
  .filter((d) => existsSync(join(root, d.name, "index.js")))
  .map((d) => d.name);

if (!endpoints.length) {
  console.error("no endpoint directories found");
  process.exit(1);
}

rmSync(join(root, "dist"), { recursive: true, force: true });

for (const name of endpoints) {
  await build({
    entryPoints: [join(root, name, "index.js")],
    outfile: join(root, "dist", name, "index.mjs"),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    external: ["@aws-sdk/*"],
    sourcemap: false,
    minify: false, // readable stack traces in CloudWatch beat a few KB
    // NO createRequire banner: esbuild injects its own shim when a bundled
    // module references require() (e.g. src/data/complianceKnowledge.js in
    // the knowledge bundle), and a manual banner then collides with it —
    // "Identifier 'createRequire' has already been declared" at Lambda init
    // (issue #87 dev verification; the exact failure the smoke test below
    // now catches at build time).
  });

  // Init smoke test: import the bundle the way the Lambda runtime will.
  // A syntax error or top-level crash fails the build here instead of
  // surfacing as Runtime.UserCodeSyntaxError 500s after deploy.
  const mod = await import(pathToFileURL(join(root, "dist", name, "index.mjs")).href);
  if (typeof mod.handler !== "function") {
    console.error(`dist/${name}/index.mjs loaded but exports no handler()`);
    process.exit(1);
  }
  console.log(`built dist/${name}/index.mjs (init smoke test passed)`);
}
