#!/usr/bin/env node
/* global process */
// tests/api-aws/coverage.test.js — enforces the CLAUDE.md rule that every
// Lambda endpoint has response-parity unit tests (issue #87). For each
// api-aws/<name>/index.js endpoint this asserts:
//
//   1. tests/api-aws/<name>.test.js exists
//   2. it is wired into the `test:apiaws` script in package.json
//   3. it is run as a step in .github/workflows/api-aws-tests.yml
//   4. if a Vercel original api/<name>.js exists, it is in that workflow's
//      PR trigger paths (so drift between the two copies re-runs parity)
//
// A new port that skips any recipe step (api-aws/README.md step 5) fails
// here instead of silently shipping untested.
//
// Usage: node tests/api-aws/coverage.test.js   (exit 0 = green)

import { readdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const apiAwsDir = join(repoRoot, "api-aws");

const endpoints = readdirSync(apiAwsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !["shared", "dist", "node_modules"].includes(d.name))
  .filter((d) => existsSync(join(apiAwsDir, d.name, "index.js")))
  .map((d) => d.name)
  .sort();

if (!endpoints.length) {
  console.error("no api-aws endpoint directories found — is the repo layout intact?");
  process.exit(1);
}

const testScript = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).scripts["test:apiaws"] || "";
const workflow = readFileSync(join(repoRoot, ".github", "workflows", "api-aws-tests.yml"), "utf8");

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

console.log(`\n── every Lambda endpoint ships with wired-in parity tests ──────`);
console.log(`endpoints: ${endpoints.join(", ")}\n`);

for (const name of endpoints) {
  const testRef = `tests/api-aws/${name}.test.js`;
  assert(existsSync(join(repoRoot, testRef)), `${name}: ${testRef} exists`);
  assert(testScript.includes(testRef), `${name}: wired into package.json test:apiaws`);
  assert(workflow.includes(testRef), `${name}: run as a step in api-aws-tests.yml`);
  if (existsSync(join(repoRoot, "api", `${name}.js`))) {
    assert(workflow.includes(`api/${name}.js`), `${name}: Vercel original api/${name}.js in the workflow trigger paths`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("Failures:\n  " + failures.join("\n  "));
  console.error("\nEvery api-aws/<name>/ endpoint needs tests/api-aws/<name>.test.js,");
  console.error("wired into test:apiaws and the api-aws-tests workflow (port recipe");
  console.error("step 5, api-aws/README.md; requirement recorded in CLAUDE.md).");
  process.exit(1);
}
