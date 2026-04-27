import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRouteQuery,
  normaliseLocation,
  deriveTags,
  medianPrice,
  rankScore,
  rankLoads,
  sanitiseSearchConfig,
  SEARCH_CONFIG_DEFAULTS,
} from '../../src/services/searchService.js';

// ── parseRouteQuery ─────────────────────────────────────────────────────────
test('parseRouteQuery handles "City to City"', () => {
  const r = parseRouteQuery('Delhi to Mumbai');
  assert.equal(r.isRoute, true);
  assert.equal(r.from, 'Delhi');
  assert.equal(r.to, 'Mumbai');
  assert.deepEqual(r.stops, []);
});

test('parseRouteQuery handles arrow + multi-stop', () => {
  const r = parseRouteQuery('Delhi → Jaipur → Mumbai');
  assert.equal(r.isRoute, true);
  assert.equal(r.from, 'Delhi');
  assert.equal(r.to, 'Mumbai');
  assert.deepEqual(r.stops, ['Jaipur']);
});

test('parseRouteQuery handles PIN to PIN', () => {
  const r = parseRouteQuery('110001 to 400001');
  assert.equal(r.isRoute, true);
  assert.equal(r.isPinPair, true);
});

test('parseRouteQuery returns isRoute=false for plain text', () => {
  const r = parseRouteQuery('full truck load');
  assert.equal(r.isRoute, false);
  assert.equal(r.from, '');
});

test('parseRouteQuery handles empty / non-string input', () => {
  assert.equal(parseRouteQuery('').isRoute, false);
  assert.equal(parseRouteQuery(null).isRoute, false);
  assert.equal(parseRouteQuery(undefined).isRoute, false);
  assert.equal(parseRouteQuery(123).isRoute, false);
});

// ── normaliseLocation ───────────────────────────────────────────────────────
test('normaliseLocation lowercases, trims, collapses whitespace + punctuation', () => {
  assert.equal(normaliseLocation('  New Delhi.  '), 'new delhi');
  assert.equal(normaliseLocation('Mumbai, MH'), 'mumbai mh');
  assert.equal(normaliseLocation(null), '');
  assert.equal(normaliseLocation(undefined), '');
});

test('normaliseLocation caps length to 80 chars', () => {
  const out = normaliseLocation('a'.repeat(200));
  assert.ok(out.length <= 80);
});

// ── medianPrice ─────────────────────────────────────────────────────────────
test('medianPrice returns null for fewer than 3 priced loads', () => {
  assert.equal(medianPrice([]), null);
  assert.equal(medianPrice([{ freightPrice: 100 }, { freightPrice: 200 }]), null);
});

test('medianPrice returns the middle of an odd-length sample', () => {
  assert.equal(
    medianPrice([{ freightPrice: 100 }, { freightPrice: 300 }, { freightPrice: 200 }]),
    200
  );
});

test('medianPrice returns the mean of the two middles for an even-length sample', () => {
  assert.equal(
    medianPrice([
      { freightPrice: 100 }, { freightPrice: 200 }, { freightPrice: 300 }, { freightPrice: 400 },
    ]),
    250
  );
});

// ── deriveTags ──────────────────────────────────────────────────────────────
test('deriveTags flags urgent when pickup is within 24h', () => {
  const now = Date.now();
  const tags = deriveTags({
    load: { pickupDate: new Date(now + 6 * 60 * 60 * 1000) },
    now,
  });
  assert.ok(tags.includes('urgent'));
});

test('deriveTags does NOT flag urgent when pickup is in the past or far future', () => {
  const now = Date.now();
  assert.ok(!deriveTags({ load: { pickupDate: new Date(now - 1000) }, now }).includes('urgent'));
  assert.ok(!deriveTags({ load: { pickupDate: new Date(now + 5 * 24 * 3600 * 1000) }, now }).includes('urgent'));
});

test('deriveTags flags high-paying when price > 1.5x route median', () => {
  const tags = deriveTags({
    load: { freightPrice: 5000 },
    routeMedianPrice: 1000,
  });
  assert.ok(tags.includes('high-paying'));
});

test('deriveTags flags verified when poster KYC is approved', () => {
  assert.ok(deriveTags({ load: {}, posterKycStatus: 'approved' }).includes('verified'));
  assert.ok(!deriveTags({ load: {}, posterKycStatus: 'pending' }).includes('verified'));
});

test('deriveTags flags sponsored when loadId is in the pinned list', () => {
  const tags = deriveTags({
    load: { loadId: 'LD-42' },
    sponsoredLoadIds: ['LD-7', 'LD-42'],
  });
  assert.ok(tags.includes('sponsored'));
});

// ── rankScore + rankLoads ───────────────────────────────────────────────────
test('rankScore boosts sponsored loads by sponsorBoost', () => {
  const cfg = { ...SEARCH_CONFIG_DEFAULTS, sponsoredLoadIds: ['LD-1'], sponsorBoost: 10 };
  const sponsored = rankScore({ load: { loadId: 'LD-1', createdAt: new Date() }, config: cfg });
  const regular = rankScore({ load: { loadId: 'LD-2', createdAt: new Date() }, config: cfg });
  assert.ok(sponsored - regular >= 9.9, 'sponsored boost must dominate the recency term');
});

test('rankLoads sorts by computed score descending', () => {
  const now = Date.now();
  const items = [
    { load: { loadId: 'A', createdAt: new Date(now - 13 * 24 * 3600 * 1000), freightPrice: 100 }, textScore: 0 },
    { load: { loadId: 'B', createdAt: new Date(now), freightPrice: 100_000 }, textScore: 0 },
  ];
  const sorted = rankLoads(items, SEARCH_CONFIG_DEFAULTS, now);
  assert.equal(sorted[0].load.loadId, 'B');
});

// ── sanitiseSearchConfig ────────────────────────────────────────────────────
test('sanitiseSearchConfig clamps numeric weights to [0,20]', () => {
  const out = sanitiseSearchConfig({ recencyWeight: 999, priceWeight: -5, textWeight: 'nope' });
  assert.equal(out.recencyWeight, 20);
  assert.equal(out.priceWeight, 0);
  // Non-number is rejected — falls back to default.
  assert.equal(out.textWeight, SEARCH_CONFIG_DEFAULTS.textWeight);
});

test('sanitiseSearchConfig drops non-string sponsoredLoadIds and caps to 50', () => {
  const ids = Array.from({ length: 80 }, (_, i) => `LD-${i}`);
  const out = sanitiseSearchConfig({ sponsoredLoadIds: [...ids, 123, null, '', '  '] });
  assert.ok(out.sponsoredLoadIds.length <= 50);
  assert.ok(out.sponsoredLoadIds.every((id) => typeof id === 'string' && id.length > 0));
});

test('sanitiseSearchConfig only accepts boolean filter toggles', () => {
  const out = sanitiseSearchConfig({ filters: { from: false, vehicle: 'no', bogus: true } });
  assert.equal(out.filters.from, false);
  assert.equal(out.filters.vehicle, true); // non-boolean → default true
  assert.equal(Object.prototype.hasOwnProperty.call(out.filters, 'bogus'), false);
});
