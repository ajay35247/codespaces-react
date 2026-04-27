import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../../src/routes/search.js';

const {
  buildRoleFilter,
  buildSearchFilter,
  applyQueryString,
  buildSort,
  searchQuerySchema,
  escapeRegex,
} = __testables;

test('buildRoleFilter restricts unauthenticated callers to open marketplace', () => {
  assert.deepEqual(buildRoleFilter(undefined), { status: 'posted' });
  assert.deepEqual(buildRoleFilter(null), { status: 'posted' });
});

test('buildRoleFilter returns empty filter for admins', () => {
  assert.deepEqual(buildRoleFilter({ id: '64b0000000000000000000aa', role: 'admin' }), {});
});

test('buildRoleFilter scopes shippers to own posts + posted marketplace', () => {
  const f = buildRoleFilter({ id: '64b0000000000000000000aa', role: 'shipper' });
  assert.ok(Array.isArray(f.$or), 'shipper filter must use $or');
  assert.equal(f.$or.length, 2);
  assert.ok(f.$or.some((c) => c.status === 'posted'));
  assert.ok(
    f.$or.some(
      (c) => c.postedBy && String(c.postedBy) === '64b0000000000000000000aa'
    )
  );
});

test('buildRoleFilter scopes drivers/brokers/truck_owners to posted only', () => {
  for (const role of ['driver', 'broker', 'truck_owner']) {
    assert.deepEqual(
      buildRoleFilter({ id: '64b0000000000000000000aa', role }),
      { status: 'posted' },
      `role ${role} must see only posted loads`
    );
  }
});

test('buildSearchFilter applies regex on from/to/vehicle and price/date ranges', () => {
  const f = buildSearchFilter(
    {
      from: 'Delhi',
      to: 'Mumbai',
      vehicle: 'Trailer',
      minPrice: 1000,
      maxPrice: 50000,
      dateFrom: '2026-01-01T00:00:00Z',
      dateTo: '2026-12-31T00:00:00Z',
    },
    null
  );

  assert.equal(f.status, 'posted');
  assert.ok(Array.isArray(f.$and));
  const sources = f.$and.map((entry) => Object.values(entry)[0].source);
  assert.ok(sources.some((s) => /Delhi/.test(s)));
  assert.ok(sources.some((s) => /Mumbai/.test(s)));
  assert.ok(sources.some((s) => /Trailer/.test(s)));
  assert.deepEqual(f.freightPrice, { $gte: 1000, $lte: 50000 });
  assert.equal(f.pickupDate.$gte instanceof Date, true);
  assert.equal(f.pickupDate.$lte instanceof Date, true);
});

test('applyQueryString uses $text for queries >= 3 chars', () => {
  const { filter, useTextScore } = applyQueryString({}, 'Mumbai');
  assert.equal(useTextScore, true);
  assert.deepEqual(filter.$text, { $search: 'Mumbai', $diacriticSensitive: false });
});

test('applyQueryString falls back to anchored regex for short queries', () => {
  const { filter, useTextScore } = applyQueryString({}, 'AB');
  assert.equal(useTextScore, false);
  assert.ok(Array.isArray(filter.$or));
  assert.ok(filter.$or.every((c) => Object.values(c)[0] instanceof RegExp));
});

test('applyQueryString escapes regex metacharacters to prevent injection', () => {
  const { filter } = applyQueryString({}, '.*');
  // The compiled regex source must contain escaped versions, not the raw .* wildcard.
  for (const clause of filter.$or) {
    const re = Object.values(clause)[0];
    assert.ok(re.source.includes('\\.'), 're must escape `.`');
    assert.ok(re.source.includes('\\*'), 're must escape `*`');
  }
});

test('escapeRegex neutralises every regex metacharacter', () => {
  const meta = '.*+?^${}()|[]\\';
  const escaped = escapeRegex(meta);
  // Compiling the escaped string as a regex must match the original input
  // literally — proving every metacharacter has been neutralised.
  const re = new RegExp(escaped);
  assert.ok(re.test(meta), 'escaped regex must match the original string literally');
  // And it must not match arbitrary noise that the unescaped pattern would have.
  assert.equal(new RegExp(`^${escaped}$`).test('xxxx'), false);
});

test('buildSort returns price-desc sort when requested', () => {
  assert.deepEqual(buildSort('price_desc', false), { freightPrice: -1, createdAt: -1 });
});

test('buildSort uses textScore meta when text search is active', () => {
  const sort = buildSort('latest', true);
  assert.deepEqual(sort.score, { $meta: 'textScore' });
});

test('searchQuerySchema rejects unknown fields and oversized q', () => {
  const { error: unknownError } = searchQuerySchema.validate({ q: 'hi', evil: 'yes' });
  assert.ok(unknownError, 'unknown keys must be rejected');

  const { error: oversizeError } = searchQuerySchema.validate({ q: 'x'.repeat(200) });
  assert.ok(oversizeError, 'queries longer than the cap must be rejected');
});

test('searchQuerySchema enforces sort enum and bounded pagination', () => {
  const { error: badSort } = searchQuerySchema.validate({ sort: 'random' });
  assert.ok(badSort, 'invalid sort must be rejected');

  const { error: hugeLimit } = searchQuerySchema.validate({ limit: 9999 });
  assert.ok(hugeLimit, 'limit above the cap must be rejected');
});
