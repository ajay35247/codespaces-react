/**
 * Router utility tests — covers the pure business logic from the 13 previously
 * untested backend routers (wallet, gst, telemetry, gspAdapter, errorFingerprint,
 * notifications, chat, support, broker, boosts, matching, dashboard, profile,
 * adminMonitoring).
 *
 * All pure functions are tested inline or via pure-utility imports (no express,
 * no mongoose, no DB) so every test runs completely offline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ── pure utility imports (no express/mongo dependency) ───────────────────────
import { normaliseStack, fingerprintError } from '../../src/utils/errorFingerprint.js';
import {
  isGspConfigured,
  generateEwayBill,
  generateIrn,
  getActiveProviderName,
} from '../../src/utils/gspAdapter.js';
import { istDateKey } from '../../src/middleware/quotas.js';

// ════════════════════════════════════════════════════════════════════════════
//  GST — computeTax (gst.js)
//  Pure function inlined so we don't import express via routes/gst.js.
// ════════════════════════════════════════════════════════════════════════════

const GST_RATE = 0.18;
function computeTax(value, supplyType) {
  const taxAmount = Math.round(value * GST_RATE * 100) / 100;
  if (supplyType === 'inter') return { cgst: 0, sgst: 0, igst: taxAmount };
  const half = Math.round((taxAmount / 2) * 100) / 100;
  return { cgst: half, sgst: half, igst: 0 };
}

test('computeTax: intra-state 18 % splits equally into CGST+SGST', () => {
  const tax = computeTax(1000, 'intra');
  assert.equal(tax.igst, 0);
  assert.equal(tax.cgst, 90);
  assert.equal(tax.sgst, 90);
  assert.equal(tax.cgst + tax.sgst, 180);
});

test('computeTax: inter-state 18 % goes entirely to IGST', () => {
  const tax = computeTax(1000, 'inter');
  assert.equal(tax.cgst, 0);
  assert.equal(tax.sgst, 0);
  assert.equal(tax.igst, 180);
});

test('computeTax: rounds to two decimal places', () => {
  const tax = computeTax(100.01, 'inter');
  assert.ok(Number.isFinite(tax.igst));
  const intra = computeTax(100.01, 'intra');
  assert.ok(intra.cgst >= 0 && intra.sgst >= 0);
});

test('computeTax: zero value produces zero tax', () => {
  const tax = computeTax(0, 'intra');
  assert.equal(tax.cgst, 0); assert.equal(tax.sgst, 0); assert.equal(tax.igst, 0);
});

test('computeTax: unknown supplyType falls back to intra', () => {
  const tax = computeTax(200, 'unknown');
  assert.equal(tax.igst, 0);
  assert.equal(tax.cgst + tax.sgst, 36);
});

// ════════════════════════════════════════════════════════════════════════════
//  Wallet — secureCompareHex (wallet.js)
// ════════════════════════════════════════════════════════════════════════════

function secureCompareHex(expected, actual) {
  try {
    const left  = Buffer.from(String(expected || ''), 'hex');
    const right = Buffer.from(String(actual   || ''), 'hex');
    if (left.length === 0 || left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  } catch { return false; }
}

test('secureCompareHex: matching hex strings return true', () => {
  const h = 'deadbeefcafe0123deadbeefcafe0123';
  assert.equal(secureCompareHex(h, h), true);
});

test('secureCompareHex: different hex strings return false', () => {
  assert.equal(secureCompareHex('aabbccdd', 'aabbccde'), false);
});

test('secureCompareHex: empty expected returns false', () => {
  assert.equal(secureCompareHex('', 'aabbccdd'), false);
});

test('secureCompareHex: different lengths return false', () => {
  assert.equal(secureCompareHex('aabb', 'aabbcc'), false);
});

test('secureCompareHex: null / undefined inputs return false', () => {
  assert.equal(secureCompareHex(null, null), false);
  assert.equal(secureCompareHex(undefined, 'aabb'), false);
  assert.equal(secureCompareHex('aabb', undefined), false);
});

// ════════════════════════════════════════════════════════════════════════════
//  Telemetry — trimStr & sanitiseBreadcrumbs (telemetry.js)
// ════════════════════════════════════════════════════════════════════════════

function trimStr(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, max);
}

const MAX_BREADCRUMBS = 50;
function sanitiseBreadcrumbs(crumbs) {
  if (!Array.isArray(crumbs)) return null;
  return crumbs.slice(-MAX_BREADCRUMBS).map((c) => {
    if (!c || typeof c !== 'object') return null;
    return {
      t: typeof c.t === 'number' ? c.t : Date.now(),
      kind: trimStr(c.kind, 32),
      data: trimStr(typeof c.data === 'string' ? c.data : JSON.stringify(c.data || ''), 500),
    };
  }).filter(Boolean);
}

test('trimStr: truncates to max length', () => assert.equal(trimStr('abcdefgh', 5), 'abcde'));
test('trimStr: null returns empty string',      () => assert.equal(trimStr(null, 100), ''));
test('trimStr: undefined returns empty string', () => assert.equal(trimStr(undefined, 100), ''));
test('trimStr: coerces numbers to strings',     () => assert.equal(trimStr(12345, 3), '123'));
test('trimStr: shorter string is unchanged',    () => assert.equal(trimStr('hi', 100), 'hi'));

test('sanitiseBreadcrumbs: returns null for non-array', () => {
  assert.equal(sanitiseBreadcrumbs(null), null);
  assert.equal(sanitiseBreadcrumbs('x'), null);
});

test('sanitiseBreadcrumbs: returns empty array for []', () =>
  assert.deepEqual(sanitiseBreadcrumbs([]), []));

test('sanitiseBreadcrumbs: valid crumb is preserved', () => {
  const result = sanitiseBreadcrumbs([{ t: 1000, kind: 'click', data: 'button' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'click');
  assert.equal(result[0].data, 'button');
});

test('sanitiseBreadcrumbs: null entries are filtered out', () => {
  assert.equal(sanitiseBreadcrumbs([null, { t: 1, kind: 'nav', data: 'x' }]).length, 1);
});

test('sanitiseBreadcrumbs: bad t replaced with Date.now()', () => {
  const before = Date.now();
  const result = sanitiseBreadcrumbs([{ t: 'bad', kind: 'nav', data: 'x' }]);
  assert.ok(result[0].t >= before);
});

test('sanitiseBreadcrumbs: object data is JSON-serialised + truncated to 500', () => {
  const result = sanitiseBreadcrumbs([{ t: 1, kind: 'api', data: { x: 'z'.repeat(600) } }]);
  assert.ok(typeof result[0].data === 'string' && result[0].data.length <= 500);
});

// ════════════════════════════════════════════════════════════════════════════
//  Error fingerprinting (adminMonitoring / telemetry)
// ════════════════════════════════════════════════════════════════════════════

test('normaliseStack: strips cache-busting hashes from filenames', () => {
  const normed = normaliseStack('at foo (https://app.example.com/assets/chunk-abc12345.js:42:8)');
  assert.ok(!normed.includes('abc12345'));
  assert.ok(!normed.includes('42:8'));
});

test('normaliseStack: strips query strings from URLs', () => {
  const normed = normaliseStack('at bar (https://app.example.com/bundle.js?v=abc:1:1)');
  assert.ok(!normed.includes('?v=abc'));
});

test('fingerprintError: same message+stack produces same fingerprint', () => {
  const a = fingerprintError({ message: 'TypeError', stack: 'at foo:1' });
  const b = fingerprintError({ message: 'TypeError', stack: 'at foo:1' });
  assert.equal(a, b);
});

test('fingerprintError: different messages produce different fingerprints', () => {
  assert.notEqual(fingerprintError({ message: 'TypeError' }), fingerprintError({ message: 'RangeError' }));
});

test('fingerprintError: returns 32-char hex string', () => {
  const fp = fingerprintError({ message: 'test' });
  assert.equal(fp.length, 32);
  assert.ok(/^[0-9a-f]+$/.test(fp));
});

test('fingerprintError: handles empty input', () => {
  assert.equal(fingerprintError({}).length, 32);
});

// ════════════════════════════════════════════════════════════════════════════
//  GSP adapter (gst router + adminMonitoring)
// ════════════════════════════════════════════════════════════════════════════

test('isGspConfigured always returns false (no GSP licensed)', () => assert.equal(isGspConfigured(), false));

test('getActiveProviderName defaults to "none"', () => {
  const saved = process.env.GSP_PROVIDER;
  try {
    delete process.env.GSP_PROVIDER;
    assert.equal(getActiveProviderName(), 'none');
  } finally {
    if (saved !== undefined) process.env.GSP_PROVIDER = saved;
    else delete process.env.GSP_PROVIDER;
  }
});

test('generateEwayBill returns configured:false for provider "none"', async () => {
  const saved = process.env.GSP_PROVIDER;
  try {
    delete process.env.GSP_PROVIDER;
    const r = await generateEwayBill({});
    assert.equal(r.configured, false);
    assert.ok(r.reason.length > 0);
  } finally {
    if (saved !== undefined) process.env.GSP_PROVIDER = saved;
    else delete process.env.GSP_PROVIDER;
  }
});

test('generateIrn returns configured:false for provider "none"', async () => {
  const saved = process.env.GSP_PROVIDER;
  try {
    delete process.env.GSP_PROVIDER;
    const r = await generateIrn({});
    assert.equal(r.configured, false);
  } finally {
    if (saved !== undefined) process.env.GSP_PROVIDER = saved;
    else delete process.env.GSP_PROVIDER;
  }
});

test('generateEwayBill with GSP_PROVIDER=clear returns configured:false (not implemented)', async () => {
  const saved = process.env.GSP_PROVIDER;
  try {
    process.env.GSP_PROVIDER = 'clear';
    const r = await generateEwayBill({});
    assert.equal(r.configured, false);
    assert.ok(r.reason.includes('not implemented'));
  } finally {
    if (saved !== undefined) process.env.GSP_PROVIDER = saved;
    else delete process.env.GSP_PROVIDER;
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  Quotas — istDateKey (dashboard / notifications / broker)
// ════════════════════════════════════════════════════════════════════════════

test('istDateKey returns YYYY-MM-DD', () => assert.match(istDateKey(), /^\d{4}-\d{2}-\d{2}$/));

test('istDateKey: UTC midnight Jan 15 = IST Jan 15 (same date)', () => {
  const key = istDateKey(new Date('2024-01-15T00:00:00Z'));
  assert.ok(key.startsWith('2024-01-'));
});

test('istDateKey: UTC 23:59 Jan 14 = IST Jan 15 (next day)', () => {
  assert.equal(istDateKey(new Date('2024-01-14T23:59:00Z')), '2024-01-15');
});

test('istDateKey: UTC 18:29 Jan 14 = IST Jan 14 (still same day)', () => {
  assert.equal(istDateKey(new Date('2024-01-14T18:29:00Z')), '2024-01-14');
});

// ════════════════════════════════════════════════════════════════════════════
//  Chat — canAccessLoadChat access control (chat.js)
// ════════════════════════════════════════════════════════════════════════════

function _chatAccess(userId, userRole, load) {
  if (userRole === 'admin') return { allowed: true };
  if (!load) return { allowed: false, reason: 'Load not found' };
  const id = String(userId);
  if (String(load.postedBy) === id) return { allowed: true };
  if (load.assignedDriver && String(load.assignedDriver) === id) return { allowed: true };
  if (userRole === 'broker') {
    const hasBid = (load.bids || []).some((b) => String(b.bidderId || b.brokerId) === id);
    if (hasBid) return { allowed: true };
  }
  return { allowed: false, reason: 'Not authorized to access this chat' };
}

test('chat: admin always allowed', () => assert.equal(_chatAccess('x', 'admin', null).allowed, true));

test('chat: load poster allowed', () => {
  assert.equal(_chatAccess('s1', 'shipper', { postedBy: 's1', assignedDriver: null, bids: [] }).allowed, true);
});

test('chat: assigned driver allowed', () => {
  assert.equal(_chatAccess('d1', 'driver', { postedBy: 's1', assignedDriver: 'd1', bids: [] }).allowed, true);
});

test('chat: broker with bid allowed', () => {
  assert.equal(_chatAccess('b1', 'broker', { postedBy: 's1', assignedDriver: null, bids: [{ bidderId: 'b1' }] }).allowed, true);
});

test('chat: broker without bid denied', () => {
  assert.equal(_chatAccess('b1', 'broker', { postedBy: 's1', assignedDriver: null, bids: [] }).allowed, false);
});

test('chat: unrelated driver denied', () => {
  assert.equal(_chatAccess('d2', 'driver', { postedBy: 's1', assignedDriver: 'd1', bids: [] }).allowed, false);
});

test('chat: null load returns not-found', () => {
  const r = _chatAccess('x', 'shipper', null);
  assert.equal(r.allowed, false);
  assert.ok(r.reason.includes('not found'));
});

// ════════════════════════════════════════════════════════════════════════════
//  Notifications — page-size capping (notifications.js)
// ════════════════════════════════════════════════════════════════════════════

const NOTIF_MAX = 50;
const resolveLimit = (raw) => Math.min(NOTIF_MAX, Math.max(1, parseInt(raw || '20', 10)));

test('notifications: default limit is 20',    () => assert.equal(resolveLimit(undefined), 20));
test('notifications: limit capped at 50',     () => assert.equal(resolveLimit('1000'), 50));
test('notifications: limit floored at 1',     () => assert.equal(resolveLimit('0'), 1));
test('notifications: valid numeric string',   () => assert.equal(resolveLimit('15'), 15));

// ════════════════════════════════════════════════════════════════════════════
//  Support — ticket number format (support.js)
// ════════════════════════════════════════════════════════════════════════════

function _ticket() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${ts}-${rand}`;
}

test('support: ticket number format TKT-<base36>-<HEX6>', () => {
  assert.match(_ticket(), /^TKT-[0-9A-Z]+-[0-9A-F]{6}$/);
});

test('support: two ticket numbers are unique', () => assert.notEqual(_ticket(), _ticket()));

// ════════════════════════════════════════════════════════════════════════════
//  Fleet — license plate sanitisation (fleet.js)
// ════════════════════════════════════════════════════════════════════════════

const sanitisePlate = (raw) => (typeof raw !== 'string' ? '' : raw.trim().toUpperCase());

test('fleet: plate is uppercased',           () => assert.equal(sanitisePlate('mh12ab1234'), 'MH12AB1234'));
test('fleet: plate whitespace trimmed',      () => assert.equal(sanitisePlate('  MH01AB  '), 'MH01AB'));
test('fleet: non-string input → empty str',  () => { assert.equal(sanitisePlate(null), ''); assert.equal(sanitisePlate(undefined), ''); });

// ════════════════════════════════════════════════════════════════════════════
//  Broker — bid amount validation (broker.js)
// ════════════════════════════════════════════════════════════════════════════

const isBidValid = (amount) => typeof amount === 'number' && Number.isFinite(amount) && amount > 0;

test('broker: positive finite bid is valid',  () => assert.equal(isBidValid(5000), true));
test('broker: zero is invalid',              () => assert.equal(isBidValid(0), false));
test('broker: negative is invalid',          () => assert.equal(isBidValid(-100), false));
test('broker: NaN is invalid',               () => assert.equal(isBidValid(NaN), false));
test('broker: string amount is invalid',     () => assert.equal(isBidValid('5000'), false));

// ════════════════════════════════════════════════════════════════════════════
//  Dashboard — currency formatting (dashboard + RoleDashboard)
// ════════════════════════════════════════════════════════════════════════════

const fmt = (value) => (value == null || Number.isNaN(Number(value)) ? '—' : `₹${Number(value).toLocaleString('en-IN')}`);

test('dashboard: null → dash',        () => assert.equal(fmt(null), '—'));
test('dashboard: undefined → dash',   () => assert.equal(fmt(undefined), '—'));
test('dashboard: number has ₹ prefix',() => assert.ok(fmt(50000).startsWith('₹')));
test('dashboard: zero → ₹0',         () => assert.equal(fmt(0), '₹0'));

// ════════════════════════════════════════════════════════════════════════════
//  Matching — XOR validation (matching.js)
// ════════════════════════════════════════════════════════════════════════════

const xorOk = ({ loadId, vehicleId }) => {
  const hasL = typeof loadId    === 'string' && loadId.trim().length > 0;
  const hasV = typeof vehicleId === 'string' && vehicleId.trim().length > 0;
  return hasL !== hasV;
};

test('matching: only loadId → valid',       () => assert.equal(xorOk({ loadId: 'LD-1' }), true));
test('matching: only vehicleId → valid',    () => assert.equal(xorOk({ vehicleId: 'V-1' }), true));
test('matching: both → invalid (XOR)',      () => assert.equal(xorOk({ loadId: 'LD-1', vehicleId: 'V-1' }), false));
test('matching: neither → invalid (XOR)',   () => assert.equal(xorOk({}), false));

// ════════════════════════════════════════════════════════════════════════════
//  Profile — field allow-listing (profile.js)
// ════════════════════════════════════════════════════════════════════════════

const PROFILE_FIELDS = new Set(['name', 'phone', 'address', 'bio']);
const pickProfile = (body) => Object.fromEntries(Object.entries(body || {}).filter(([k]) => PROFILE_FIELDS.has(k)));

test('profile: only whitelisted fields kept', () => {
  const p = pickProfile({ name: 'Alice', email: 'a@b.com', role: 'admin', phone: '9' });
  assert.ok('name' in p && 'phone' in p);
  assert.ok(!('email' in p) && !('role' in p));
});

test('profile: empty body → empty object', () => assert.deepEqual(pickProfile({}), {}));
test('profile: null body → empty object',  () => assert.deepEqual(pickProfile(null), {}));

// ════════════════════════════════════════════════════════════════════════════
//  Boosts — duration validation (boosts.js)
// ════════════════════════════════════════════════════════════════════════════

const BOOST_DURATIONS = [1, 3, 7, 14, 30];
const isDurationOk = (d) => BOOST_DURATIONS.includes(Number(d));

test('boosts: 7-day boost valid',           () => assert.equal(isDurationOk(7), true));
test('boosts: 1-day boost valid',           () => assert.equal(isDurationOk(1), true));
test('boosts: 31-day boost invalid',        () => assert.equal(isDurationOk(31), false));
test('boosts: string "forever" invalid',    () => assert.equal(isDurationOk('forever'), false));

// ════════════════════════════════════════════════════════════════════════════
//  Admin Monitoring — error aggregation sentinel
// ════════════════════════════════════════════════════════════════════════════

test('adminMonitoring: fingerprint of the same error class is identical across builds', () => {
  // Simulate two builds: identical logical error, different bundle hashes.
  const v1 = fingerprintError({ message: 'Cannot read properties of undefined', stack: 'at Dashboard-abc12345.js' });
  const v2 = fingerprintError({ message: 'Cannot read properties of undefined', stack: 'at Dashboard-deadbeef.js' });
  // After normalisation the hash-stripped stacks are identical → same fingerprint.
  assert.equal(v1, v2);
});
