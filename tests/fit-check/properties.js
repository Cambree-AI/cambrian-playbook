#!/usr/bin/env node
// Seller-AGNOSTIC property tests for the fit scorer. Plain Node ESM, exit 0/1.
//   node tests/fit-check/properties.js
//
// The BHN golden set is a per-seller regression snapshot. THIS file guards
// generalization: invariants that must hold for any seller, plus proof that
// the scorer actually consumes the seller ICP. Assertions are RELATIONAL
// (orderings / invariances), so they survive intentional re-tuning.

import { computeFitScore } from '../../src/lib/fitScoring.js';
const W = { dim1: 45, dim2: 30, dim3: 25 };

// computeFitScore reads sellerICP?.icp?.companySize and sellerICP?.icp?.customerExamples.
// All ICP fields must be nested under `icp`.
function sellerICP(overrides = {}) {
  return {
    icp: {
      industries: ['Hospitality', 'Fintech'],
      companySize: '5000-49999|50000+',
      customerExamples: ['Reference Customer'],
      competitiveAlternatives: ['CompetitorCo'],
      ...overrides,
    },
  };
}

// Spectrum of sellers (broad enterprise / narrow SMB vertical / services-channel)
const SELLERS = {
  broadEnterprise: sellerICP({ industries: ['Hospitality','Fintech','Healthcare','Government','Technology'],
                               companySize: '5000-49999|50000+', customerExamples: ['Ref A','Ref B'] }),
  narrowSMB:       sellerICP({ industries: ['Community Banking'], companySize: '50-499',
                               customerExamples: [], competitiveAlternatives: ['NicheRival'] }),
  servicesPartner: sellerICP({ industries: ['Professional Services'], companySize: '500-4999|5000-49999',
                               customerExamples: ['Client X'], competitiveAlternatives: ['BigSI'] }),
};

// Signal shape matches the live [capture] output (same fields as signals-fixture.json).
function signals(o = {}) {
  return {
    industryMatch: 'unrelated', industryInSellerTargetList: false, specificProductMapping: '',
    isExistingCustomer: false, closestCustomerName: '', closestCustomerIndustry: '',
    customerIndustryMatch: 'different', customerUseCaseMatch: 'different',
    isCompetitor: false, competitorCustomerEvidence: '', hasVerifiedCompetitorRelationship: false,
    hasDeepPlatformLockin: '', ownershipType: 'public', employeeBracket: '5000-49999', ...o,
  };
}
const NEW_DEFAULTS = { signalConfidence: 'low', primaryIncumbentVendor: null, primaryBuyingDepartment: null,
                       annualRevenueBracket: null, isChannelPartner: false, bestFitProductLine: null };

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};
const score = (sig, icp) => computeFitScore(sig, icp, W);

console.log('\nProperty Tests — cross-seller invariants\n');

// ── Invariants — run for EVERY seller ───────────────────────────────
for (const [s, icp] of Object.entries(SELLERS)) {
  const a = score(signals({ industryMatch: 'direct' }), icp);
  const b = score(signals({ industryMatch: 'direct' }), icp);
  check(`[${s}] deterministic`, JSON.stringify(a) === JSON.stringify(b));

  const comp = score(signals({ isCompetitor: true, hasVerifiedCompetitorRelationship: true }), icp);
  check(`[${s}] competitor → score 0`, comp.score === 0, `got ${comp.score}`);
  check(`[${s}] competitor → label Competitor`, comp.label === 'Competitor', `got ${comp.label}`);

  const exist = score(signals({ isExistingCustomer: true }), icp);
  check(`[${s}] existing customer → dim2 maxed`, exist.rawDim2 >= 30, `rawDim2=${exist.rawDim2}`);

  const d  = score(signals({ industryMatch: 'direct' }), icp).score;
  const aj = score(signals({ industryMatch: 'adjacent' }), icp).score;
  const un = score(signals({ industryMatch: 'unrelated' }), icp).score;
  check(`[${s}] industryMatch monotonic`, d >= aj && aj >= un, `d=${d} adj=${aj} un=${un}`);

  const cN = score(signals({}), icp).rawDim2;
  const cI = score(signals({ closestCustomerName: 'X', customerIndustryMatch: 'same' }), icp).rawDim2;
  const cB = score(signals({ closestCustomerName: 'X', customerIndustryMatch: 'same', customerUseCaseMatch: 'same' }), icp).rawDim2;
  check(`[${s}] customer-match monotonic in dim2`, cB >= cI && cI >= cN, `none=${cN} ind=${cI} both=${cB}`);

  const base    = score(signals({ industryMatch: 'direct' }), icp);
  const withNew = score({ ...signals({ industryMatch: 'direct' }), ...NEW_DEFAULTS }, icp);
  check(`[${s}] new signals at defaults are no-ops`, JSON.stringify(base) === JSON.stringify(withNew));

  const strong = score(signals({ industryMatch: 'direct', closestCustomerName: 'X', customerIndustryMatch: 'same', customerUseCaseMatch: 'same' }), icp).score;
  const poor   = score(signals({ industryMatch: 'unrelated' }), icp).score;
  check(`[${s}] strong outscores poor`, strong > poor, `strong=${strong} poor=${poor}`);
}

// ── Anti-overfit: the scorer MUST consume the seller ICP ────────────
console.log('');
const sizeBig   = sellerICP({ companySize: '50000+' });
const sizeSmall = sellerICP({ companySize: '50-499' });
const bigTarget = signals({ industryMatch: 'direct', employeeBracket: '50000+' });
const eB = score(bigTarget, sizeBig), eS = score(bigTarget, sizeSmall);
check('size conditioning: same target differs across seller size targets',
      eB.score !== eS.score || eB.rawDim1 !== eS.rawDim1,
      `sizeBig=${eB.score}/${eB.rawDim1}  sizeSmall=${eS.score}/${eS.rawDim1}`);

const hasCust = sellerICP({ customerExamples: ['A','B'] });
const noCust  = sellerICP({ customerExamples: [] });
const noMatch = signals({ industryMatch: 'direct' });
const dWith = score(noMatch, hasCust).rawDim2, dWithout = score(noMatch, noCust).rawDim2;
check('customer conditioning: dim2 responds to seller customerExamples',
      dWith !== dWithout, `withCustomers=${dWith}  withoutCustomers=${dWithout}`);

console.log(`\nProperties: ${pass} passed, ${fail} failed across ${Object.keys(SELLERS).length} sellers.`);
if (fail) {
  console.log('FAIL — a cross-seller invariant broke. Do not promote.');
  process.exit(1);
}
console.log('PASS — invariants hold across the seller spectrum.');
process.exit(0);
