import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePlanCode, PLAN_FEATURES, PLAN_RANK, PLAN_ALIASES } from '../../src/middleware/subscription.js';
import { istDateKey } from '../../src/middleware/quotas.js';

test('resolvePlanCode maps legacy 3-tier codes to canonical 4-tier', () => {
  assert.equal(resolvePlanCode('growth'), 'standard');
  assert.equal(resolvePlanCode('enterprise'), 'premium');
});

test('resolvePlanCode keeps canonical 4-tier codes unchanged', () => {
  for (const code of ['free', 'basic', 'standard', 'premium']) {
    assert.equal(resolvePlanCode(code), code);
  }
});

test('resolvePlanCode falls back to free for unknown / missing input', () => {
  assert.equal(resolvePlanCode(undefined), 'free');
  assert.equal(resolvePlanCode(''), 'free');
  assert.equal(resolvePlanCode('mystery-tier'), 'free');
});

test('PLAN_FEATURES has the four canonical tiers with required keys', () => {
  for (const code of ['free', 'basic', 'standard', 'premium']) {
    const f = PLAN_FEATURES[code];
    assert.ok(f, `missing tier ${code}`);
    assert.equal(typeof f.loadsPerDay, 'number');
    assert.equal(typeof f.bidsPerDay, 'number');
    assert.equal(typeof f.priorityVisibility, 'boolean');
    assert.equal(typeof f.fastMatching, 'boolean');
    assert.equal(typeof f.premiumBadge, 'boolean');
    assert.equal(typeof f.adsEnabled, 'boolean');
    assert.ok(['community', 'email', 'priority'].includes(f.supportSla));
  }
});

test('Premium tier has unlimited (-1 sentinel) loads and bids', () => {
  assert.equal(PLAN_FEATURES.premium.loadsPerDay, -1);
  assert.equal(PLAN_FEATURES.premium.bidsPerDay, -1);
});

test('Standard tier has the loss-aversion exclusions per spec', () => {
  // Spec: Standard explicitly does NOT get priority visibility, premium
  // badge, or fast matching — these are the levers that push 199 → 299.
  assert.equal(PLAN_FEATURES.standard.priorityVisibility, false);
  assert.equal(PLAN_FEATURES.standard.premiumBadge, false);
  assert.equal(PLAN_FEATURES.standard.fastMatching, false);
});

test('Free tier has ads enabled, paid tiers do not', () => {
  assert.equal(PLAN_FEATURES.free.adsEnabled, true);
  assert.equal(PLAN_FEATURES.basic.adsEnabled, false);
  assert.equal(PLAN_FEATURES.standard.adsEnabled, false);
  assert.equal(PLAN_FEATURES.premium.adsEnabled, false);
});

test('PLAN_RANK orders the 4 tiers ascending', () => {
  assert.ok(PLAN_RANK.free < PLAN_RANK.basic);
  assert.ok(PLAN_RANK.basic < PLAN_RANK.standard);
  assert.ok(PLAN_RANK.standard < PLAN_RANK.premium);
});

test('PLAN_ALIASES exposes the legacy mapping', () => {
  assert.equal(PLAN_ALIASES.growth, 'standard');
  assert.equal(PLAN_ALIASES.enterprise, 'premium');
});

test('istDateKey returns ISO YYYY-MM-DD for IST', () => {
  // 2024-06-01 19:30 UTC = 2024-06-02 01:00 IST → "2024-06-02"
  const utcLateEvening = new Date('2024-06-01T19:30:00Z');
  assert.equal(istDateKey(utcLateEvening), '2024-06-02');

  // 2024-06-01 12:00 UTC = 2024-06-01 17:30 IST → "2024-06-01"
  const utcMidday = new Date('2024-06-01T12:00:00Z');
  assert.equal(istDateKey(utcMidday), '2024-06-01');
});
