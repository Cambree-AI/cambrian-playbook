#!/usr/bin/env node
/**
 * No-Op Invariant — proven across the FULL golden set. Plain Node ESM, no test framework.
 *
 * For every golden-set account's real signals, adding the new Phase 1 signals at
 * their no-op defaults must NOT change score, label, or any raw dimension.
 *
 * Exit codes:
 *   0 = PASS  — invariant holds for every golden account
 *   1 = FAIL  — a default signal moved an existing score (a real violation — revert before proceeding)
 *   2 = PENDING — signals fixture not populated (NOT a pass — Phase 2 gate stays blocked)
 *
 * Usage:  node tests/fit-check/noop.js
 *
 * Re-run after EVERY Phase 2 activation. If it exits 1, the change moved an
 * existing score — revert before proceeding. If it exits 2, the safety net
 * isn't armed yet — do not start Phase 2.
 *
 * Matches the style of tests/golden-set/run.js (plain Node, no Jest/Vitest).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeFitScore } from '../../src/lib/fitScoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(resolve(__dirname, p), 'utf8'));

// fitWeights is user-tunable at runtime (sliders in the app).
// Tests pin the documented DEFAULT only — a user who tuned weights would
// produce different live scores, so the default is the stable canonical anchor.
// Verified: useState({dim1:45,dim2:30,dim3:25}) in App.jsx line 4552.
const DEFAULT_FIT_WEIGHTS = { dim1: 45, dim2: 30, dim3: 25 };

// New Phase 1 signals at their no-op defaults.
// These must not influence any score until Phase 2 activation.
const NEW_SIGNAL_DEFAULTS = {
  signalConfidence:        'low',
  primaryIncumbentVendor:  null,
  primaryBuyingDepartment: null,
  annualRevenueBracket:    null,
  isChannelPartner:        false,
  bestFitProductLine:      null,
};

// A real (non-skeleton) signals entry must have industryMatch as a string.
// industryMatch is required in every extraction and is never optional.
const isPopulated = (s) =>
  s && typeof s === 'object' && typeof s.industryMatch === 'string';

function main() {
  const golden  = read('golden-set.json');
  const fixture = read('signals-fixture.json');

  const expectedNames = golden.accounts.map((a) => a.name);
  const sellerICP     = fixture.sellerICP;

  // ── PENDING gate ────────────────────────────────────────────────────────────
  // Every golden account must have populated signals AND sellerICP must be real.
  // Exit 2 means the safety net isn't armed — this is NOT a pass.
  // The Phase 2 gate must treat exit 2 identically to exit 1 (blocked).
  const missing = expectedNames.filter(
    (name) => !isPopulated(fixture.accounts?.[name])
  );
  const icpReady = sellerICP?.icp?.companySize &&
    !String(sellerICP.icp.companySize).startsWith('FILL');

  if (!icpReady || missing.length) {
    console.log('\nPENDING — No-Op test cannot run yet. This is NOT a pass.');
    console.log('Phase 2 is blocked until this script exits 0.\n');
    if (!icpReady) {
      console.log('  ✗  signals-fixture.json → sellerICP not populated');
      console.log('     Fill from the BHN sellerICP state captured during the Step 1 test run.');
    }
    if (missing.length) {
      console.log(`  ✗  signals not populated for: ${missing.join(', ')}`);
      console.log('     Fill from the [scoreFit] console output during the Step 1 test run.');
    }
    console.log('\nHow to populate:');
    console.log('  1. Run the 10-account test plan against staging (Step 1 of Phase 0).');
    console.log('  2. Copy the signals from each [scoreFit] console log line into signals-fixture.json.');
    console.log('  3. Copy the BHN sellerICP object (logged or inspected from React state) into sellerICP.');
    console.log('  4. Re-run this script — it should exit 0.\n');
    process.exit(2);
  }

  // ── Invariant check ─────────────────────────────────────────────────────────
  console.log(`\nNo-Op Invariant — ${expectedNames.length} golden accounts (${fixture.seller})\n`);

  let failures = 0;
  for (const name of expectedNames) {
    const signals = fixture.accounts[name];
    const champ   = computeFitScore(signals, sellerICP, DEFAULT_FIT_WEIGHTS);
    const chall   = computeFitScore(
      { ...signals, ...NEW_SIGNAL_DEFAULTS },
      sellerICP,
      DEFAULT_FIT_WEIGHTS
    );

    const same =
      chall.score    === champ.score    &&
      chall.label    === champ.label    &&
      chall.rawDim1  === champ.rawDim1  &&
      chall.rawDim2  === champ.rawDim2  &&
      chall.rawDim3  === champ.rawDim3;

    if (same) {
      console.log(`  PASS  ${name.padEnd(18)}  score=${champ.score}  ${champ.label}  [${champ.rawDim1}/${champ.rawDim2}/${champ.rawDim3}]`);
    } else {
      failures++;
      console.log(`  FAIL  ${name.padEnd(18)}  champion ${champ.score}/${champ.label} [${champ.rawDim1}/${champ.rawDim2}/${champ.rawDim3}]`);
      console.log(`        ${''.padEnd(18)}  challngr ${chall.score}/${chall.label} [${chall.rawDim1}/${chall.rawDim2}/${chall.rawDim3}]`);
      // Identify which new signal caused the change
      for (const [key, val] of Object.entries(NEW_SIGNAL_DEFAULTS)) {
        const probe = computeFitScore({ ...signals, [key]: val }, sellerICP, DEFAULT_FIT_WEIGHTS);
        if (probe.score !== champ.score || probe.label !== champ.label) {
          console.log(`        ${''.padEnd(18)}  ↳ caused by: ${key}=${JSON.stringify(val)}`);
        }
      }
    }
  }

  console.log(`\nResult: ${expectedNames.length - failures}/${expectedNames.length} accounts invariant.\n`);

  if (failures) {
    console.log('FAIL — one or more default signals moved an existing score.');
    console.log('Revert the offending Phase 2 change before proceeding.\n');
    process.exit(1);
  }

  console.log('PASS — new signals at defaults change nothing across the full golden set.');
  console.log('Phase 2 gate: this script must stay green after every activation.\n');
  process.exit(0);
}

main();
