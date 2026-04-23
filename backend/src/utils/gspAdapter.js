/**
 * GSP (GST Suvidha Provider) adapter interface.
 *
 * Real GSTN e-way bill and IRN (e-invoice) generation requires a paid GSP
 * license (~₹2–5L/yr) plus KYC with GSTN.  This file defines the provider
 * surface so that once a license is signed, a concrete adapter can be
 * plugged in without touching the routes that call it.
 *
 * Current state: `GSP_PROVIDER` env var selects the adapter.  Only the
 * `none` adapter is implemented today — every method returns
 * `{ configured: false, reason: '…' }` so the API layer can emit a clean
 * 501 Not Implemented instead of faking a bill number.
 *
 *   GSP_PROVIDER=none     → the default; no external calls
 *   GSP_PROVIDER=clear    → Clear (ClearTax) GSP — NOT implemented yet
 *   GSP_PROVIDER=cygnet   → Cygnet GSP — NOT implemented yet
 *   GSP_PROVIDER=masters  → Masters India GSP — NOT implemented yet
 *
 * Adding a real provider: create `gspProviderClear.js` that exports
 * `generateEwayBill(invoice)` and `generateIrn(invoice)` with the same
 * signatures as below, and extend `getAdapter()` to dispatch to it.
 */

/**
 * @typedef {object} GspNotConfigured
 * @property {false} configured
 * @property {string} provider
 * @property {string} reason
 */

/**
 * @typedef {object} GspResult
 * @property {true} configured
 * @property {string} provider
 * @property {string} [ewayBillNumber]
 * @property {string} [irn]
 * @property {string} [ackNumber]
 * @property {Date}   [generatedAt]
 */

/** No-op adapter for when no GSP license is configured. */
const noneAdapter = {
  name: 'none',
  async generateEwayBill() {
    return {
      configured: false,
      provider: 'none',
      reason: 'No GSP provider configured. Set GSP_PROVIDER and corresponding credentials to enable e-way bill generation.',
    };
  },
  async generateIrn() {
    return {
      configured: false,
      provider: 'none',
      reason: 'No GSP provider configured. Set GSP_PROVIDER and corresponding credentials to enable IRN/e-invoice generation.',
    };
  },
};

const stubAdapter = (name) => ({
  name,
  async generateEwayBill() {
    return {
      configured: false,
      provider: name,
      reason: `GSP_PROVIDER=${name} is declared but the adapter is not implemented yet. Add gspProvider${name[0].toUpperCase()}${name.slice(1)}.js and wire it in utils/gspAdapter.js.`,
    };
  },
  async generateIrn() {
    return {
      configured: false,
      provider: name,
      reason: `GSP_PROVIDER=${name} is declared but the adapter is not implemented yet.`,
    };
  },
});

function getAdapter() {
  const provider = (process.env.GSP_PROVIDER || 'none').toLowerCase();
  switch (provider) {
    case 'none':
      return noneAdapter;
    case 'clear':
    case 'cygnet':
    case 'masters':
      return stubAdapter(provider);
    default:
      console.warn(`Unknown GSP_PROVIDER=${provider}, falling back to 'none'`);
      return noneAdapter;
  }
}

/**
 * Returns `true` when the configured GSP provider can generate real e-way
 * bills.  Today this is always `false` — every adapter is a stub.
 */
export function isGspConfigured() {
  return false;
}

/**
 * Generate an e-way bill for a GST invoice.  Returns `{ configured: false,
 * reason }` when no GSP is wired; real providers return the e-way bill
 * number + ack details.
 */
export async function generateEwayBill(invoice) {
  return getAdapter().generateEwayBill(invoice);
}

/**
 * Generate an IRN (Invoice Reference Number) / e-invoice.  Returns
 * `{ configured: false, reason }` when no GSP is wired.
 */
export async function generateIrn(invoice) {
  return getAdapter().generateIrn(invoice);
}

export function getActiveProviderName() {
  return getAdapter().name;
}
