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
import { fileURLToPath } from "url";

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
    // ESM output needs an import-based require shim for any CJS dep esbuild
    // pulls in (none today; harmless to keep).
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
  console.log(`built dist/${name}/index.mjs`);
}
