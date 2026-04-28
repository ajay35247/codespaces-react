import test from 'node:test';
import assert from 'node:assert/strict';

import {
  percentile,
  extractPrices,
  priceStats,
  selectSample,
  suggestBidForLoad,
  MIN_SAMPLE_SIZE,
} from '../../src/services/bidSuggestion.js';

// ── percentile ───────────────────────────────────────────────────────────────
test('percentile returns null for empty input', () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile(null, 0.5), null);
});

test('percentile returns the only element for size-1 input', () => {
  assert.equal(percentile([42], 0.5), 42);
  assert.equal(percentile([42], 0), 42);
  assert.equal(percentile([42], 1), 42);
});

test('percentile interpolates linearly between elements', () => {
  // Sorted [10, 20, 30, 40, 50]; idx = 0.5 * 4 = 2 → exact 30
  assert.equal(percentile([10, 20, 30, 40, 50], 0.5), 30);
  // idx = 0.25 * 4 = 1 → exact 20
  assert.equal(percentile([10, 20, 30, 40, 50], 0.25), 20);
  // idx = 0.75 * 4 = 3 → exact 40
  assert.equal(percentile([10, 20, 30, 40, 50], 0.75), 40);
  // 4-element interpolation: idx = 0.5 * 3 = 1.5 → halfway between 20 and 30
  assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
});

test('percentile clamps p outside [0,1]', () => {
  assert.equal(percentile([10, 20, 30], -0.5), 10);
  assert.equal(percentile([10, 20, 30], 2), 30);
});

// ── extractPrices ────────────────────────────────────────────────────────────
test('extractPrices drops non-finite, zero, and negative values', () => {
  const loads = [
    { freightPrice: 100 },
    { freightPrice: 0 },
    { freightPrice: -50 },
    { freightPrice: 'NaN' },
    { freightPrice: null },
    { freightPrice: undefined },
    {},
    { freightPrice: 50 },
    { freightPrice: 200 },
  ];
  assert.deepEqual(extractPrices(loads), [50, 100, 200]);
});

test('extractPrices handles null/undefined input', () => {
  assert.deepEqual(extractPrices(null), []);
  assert.deepEqual(extractPrices(undefined), []);
  assert.deepEqual(extractPrices([]), []);
});

// ── priceStats ───────────────────────────────────────────────────────────────
test('priceStats returns null for samples below MIN_SAMPLE_SIZE', () => {
  assert.equal(priceStats([]), null);
  assert.equal(priceStats([100]), null);
  assert.equal(priceStats([100, 200]), null);
  assert.equal(MIN_SAMPLE_SIZE, 3);
});

test('priceStats produces rounded percentile fields', () => {
  const stats = priceStats([100, 200, 300, 400, 500]);
  assert.equal(stats.min, 100);
  assert.equal(stats.p25, 200);
  assert.equal(stats.median, 300);
  assert.equal(stats.p75, 400);
  assert.equal(stats.max, 500);
});

test('priceStats rounds non-integer interpolated percentiles', () => {
  // 4 values → p25 idx = 0.75 → 100 + 0.75*(150-100) = 137.5 → rounds to 138
  const stats = priceStats([100, 150, 200, 250]);
  assert.equal(stats.p25, 138);
  assert.equal(stats.median, 175);
  assert.equal(stats.p75, 213);
});

// ── selectSample ─────────────────────────────────────────────────────────────
test('selectSample prefers route+truck when 3+ matches exist', () => {
  const load = { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft' };
  const pool = [
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1000 },
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1100 },
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1200 },
    // Same-truck-different-route loads should NOT be used when route+truck has enough.
    { origin: 'Pune', destination: 'Goa', truckType: '20ft', freightPrice: 9999 },
  ];
  const sel = selectSample(load, pool);
  assert.equal(sel.basis, 'route+truck');
  assert.deepEqual(sel.prices, [1000, 1100, 1200]);
});

test('selectSample falls back to truck-type when route is too sparse', () => {
  const load = { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft' };
  const pool = [
    // Only 2 on this route — below threshold.
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1000 },
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1100 },
    // But plenty of same-truck-other-route data.
    { origin: 'Pune', destination: 'Goa', truckType: '20ft', freightPrice: 800 },
    { origin: 'Pune', destination: 'Goa', truckType: '20ft', freightPrice: 900 },
    { origin: 'Pune', destination: 'Goa', truckType: '20ft', freightPrice: 1300 },
  ];
  const sel = selectSample(load, pool);
  assert.equal(sel.basis, 'truck-type');
  assert.equal(sel.prices.length, 5);
});

test('selectSample returns insufficient-data when no basis qualifies', () => {
  const load = { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft' };
  const pool = [
    // Different truck — never matched.
    { origin: 'Delhi', destination: 'Mumbai', truckType: '40ft', freightPrice: 2000 },
    // Same truck, only 2 → both basis levels below threshold.
    { origin: 'Pune', destination: 'Goa', truckType: '20ft', freightPrice: 800 },
    { origin: 'Pune', destination: 'Goa', truckType: '20ft', freightPrice: 900 },
  ];
  const sel = selectSample(load, pool);
  assert.equal(sel.basis, 'insufficient-data');
  assert.deepEqual(sel.prices, []);
});

test('selectSample is case- and whitespace-insensitive', () => {
  const load = { origin: ' Delhi ', destination: 'MUMBAI', truckType: '20ft' };
  const pool = [
    { origin: 'delhi', destination: 'mumbai', truckType: '20FT', freightPrice: 1000 },
    { origin: 'DELHI', destination: 'Mumbai', truckType: '20ft', freightPrice: 1100 },
    { origin: 'Delhi', destination: 'mumbai', truckType: '20ft', freightPrice: 1200 },
  ];
  const sel = selectSample(load, pool);
  assert.equal(sel.basis, 'route+truck');
  assert.equal(sel.prices.length, 3);
});

test('selectSample handles null load defensively', () => {
  assert.deepEqual(selectSample(null, []), { basis: 'insufficient-data', prices: [] });
});

// ── suggestBidForLoad ────────────────────────────────────────────────────────
test('suggestBidForLoad returns null suggestion when sample is insufficient', () => {
  const load = {
    origin: 'X', destination: 'Y', truckType: 'Z',
    bids: [],
  };
  const out = suggestBidForLoad(load, []);
  assert.equal(out.suggested, null);
  assert.equal(out.range, null);
  assert.equal(out.sampleSize, 0);
  assert.equal(out.basis, 'insufficient-data');
  assert.equal(out.currentLowestBid, null);
  assert.equal(out.currency, 'INR');
});

test('suggestBidForLoad returns median + range when data is sufficient', () => {
  const load = {
    origin: 'Delhi', destination: 'Mumbai', truckType: '20ft',
    bids: [
      { amount: 1500, status: 'pending' },
      { amount: 1300, status: 'pending' },
      { amount: 100,  status: 'rejected' },   // ignored
    ],
  };
  const pool = [
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1000 },
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1200 },
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1400 },
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1600 },
    { origin: 'Delhi', destination: 'Mumbai', truckType: '20ft', freightPrice: 1800 },
  ];
  const out = suggestBidForLoad(load, pool);
  assert.equal(out.basis, 'route+truck');
  assert.equal(out.sampleSize, 5);
  assert.equal(out.suggested, 1400);                 // median
  assert.equal(out.range.min, 1000);
  assert.equal(out.range.max, 1800);
  assert.equal(out.currentLowestBid, 1300);          // rejected 100 excluded
});

test('suggestBidForLoad excludes rejected bids from currentLowestBid', () => {
  const load = {
    origin: 'A', destination: 'B', truckType: 'T',
    bids: [
      { amount: 50,   status: 'rejected' },
      { amount: 999,  status: 'pending' },
      { amount: 1500, status: 'accepted' },
    ],
  };
  const out = suggestBidForLoad(load, []);
  assert.equal(out.currentLowestBid, 999);
});

test('suggestBidForLoad handles missing bids array', () => {
  const load = { origin: 'A', destination: 'B', truckType: 'T' };
  const out = suggestBidForLoad(load, []);
  assert.equal(out.currentLowestBid, null);
});
