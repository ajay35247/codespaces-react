import crypto from 'crypto';

/**
 * Thin helper wrapping the bits of the Razorpay / RazorpayX API we use
 * outside of the main Razorpay SDK (payouts, contacts, fund accounts).  The
 * SDK covers Orders / Payments well but v2.x still doesn't surface
 * RazorpayX cleanly, so we hit REST directly.
 *
 * Every function is a no-op (returns { configured: false, … }) when the
 * required env is missing so the existing acknowledgement-only path keeps
 * working in dev + for merchants who haven't activated RazorpayX yet.
 */

const RAZORPAYX_BASE = 'https://api.razorpay.com/v1';

export function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function isRazorpayXConfigured() {
  return Boolean(
    isRazorpayConfigured()
    && process.env.RAZORPAYX_ACCOUNT_NUMBER
  );
}

function getAuthHeader() {
  const token = Buffer
    .from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`)
    .toString('base64');
  return `Basic ${token}`;
}

/**
 * Timing-safe verify of a Razorpay payment signature.  Reused by both the
 * `/payments/verify` route and the new per-load escrow verify endpoint.
 */
export function verifyRazorpayOrderSignature({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) {
  if (!isRazorpayConfigured()) return false;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(String(razorpay_signature || '').toLowerCase(), 'hex');
    if (expectedBuf.length === 0 || expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

async function razorpayFetch(path, options = {}) {
  const response = await fetch(`${RAZORPAYX_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { rawText: text }; }
  if (!response.ok) {
    const message = body?.error?.description || body?.message || `Razorpay API error (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

/**
 * Register a payout destination with RazorpayX.  Creates a Contact if the
 * user doesn't have one, then a Fund Account linked to the contact.  On
 * success the caller persists contactId + fundAccountId on the user doc.
 *
 * Returns { configured: false } when RazorpayX env is missing so the caller
 * can still persist the raw VPA / bank details — the next payout attempt
 * will try to create the Razorpay side on demand.
 */
export async function registerFundAccount({ user, fundAccount }) {
  if (!isRazorpayXConfigured()) return { configured: false };

  const contact = await razorpayFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      name: (user.name || 'User').slice(0, 50),
      email: user.email,
      contact: user.phone || undefined,
      type: user.role === 'driver' ? 'vendor' : 'customer',
      reference_id: String(user._id),
    }),
  });

  let fundAccountPayload;
  if (fundAccount.method === 'vpa') {
    fundAccountPayload = {
      contact_id: contact.id,
      account_type: 'vpa',
      vpa: { address: fundAccount.vpa },
    };
  } else {
    fundAccountPayload = {
      contact_id: contact.id,
      account_type: 'bank_account',
      bank_account: {
        name: fundAccount.beneficiaryName || user.name,
        ifsc: fundAccount.ifsc,
        account_number: fundAccount.accountNumber,
      },
    };
  }

  const fa = await razorpayFetch('/fund_accounts', {
    method: 'POST',
    body: JSON.stringify(fundAccountPayload),
  });

  return { configured: true, razorpayContactId: contact.id, razorpayFundAccountId: fa.id };
}

/**
 * Issue a RazorpayX payout against a registered fund account.  Caller should
 * already have resolved `fundAccountId` (either cached on the user doc or
 * returned from registerFundAccount above).  Uses IMPS for bank transfers
 * and UPI for VPAs — both settle in seconds in production.
 */
export async function issuePayout({
  fundAccountId,
  amountInPaise,
  mode,
  referenceId,
  narration,
}) {
  if (!isRazorpayXConfigured()) return { configured: false };
  const payload = {
    account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
    fund_account_id: fundAccountId,
    amount: amountInPaise,
    currency: 'INR',
    mode: mode === 'vpa' ? 'UPI' : 'IMPS',
    purpose: 'payout',
    queue_if_low_balance: true,
    reference_id: String(referenceId || '').slice(0, 40),
    narration: String(narration || 'Freight').slice(0, 30),
  };
  const payout = await razorpayFetch('/payouts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { configured: true, payoutId: payout.id, status: payout.status };
}
