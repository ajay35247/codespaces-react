import AdminControlState from '../schemas/AdminControlStateSchema.js';

/**
 * Default state for all admin-controlled feature flags.
 *
 * Convention: *Paused = true → feature is DISABLED.
 *             maintenanceMode = true → entire platform is offline for users.
 *
 * All defaults are "everything on, maintenance off" so a fresh deployment
 * works without any database records.
 */
const DEFAULT_STATE = {
  // ── Original kill-switch flags ────────────────────────────────────────────
  bookingsPaused: false,
  paymentsPaused: false,
  registrationsPaused: false,
  // ── Extended feature flags ────────────────────────────────────────────────
  trackingPaused: false,
  matchingPaused: false,
  gstPaused: false,
  tollsPaused: false,
  fleetPaused: false,
  brokersPaused: false,
  supportPaused: false,
  // ── Maintenance mode — when true ALL non-admin API returns 503 ─────────────
  maintenanceMode: false,
};

let cachedState = { ...DEFAULT_STATE };
let lastLoadedAt = 0;

async function getKillSwitchState() {
  const now = Date.now();
  if (now - lastLoadedAt < 3000) {
    return cachedState;
  }

  try {
    const item = await AdminControlState.findOne({ key: 'kill-switch' }).lean();
    // Merge with defaults so newly-added flags appear even if the DB document
    // was written before them.
    cachedState = { ...DEFAULT_STATE, ...(item?.value || {}) };
    lastLoadedAt = now;
  } catch {
    // DB unavailable – serve last known (or default) state rather than crashing
  }
  return cachedState;
}

/**
 * Returns a copy of the current platform control state.
 * Used by the analytics and admin endpoints that need to read the state
 * without going through an HTTP guard.
 */
export async function getPlatformState() {
  return getKillSwitchState();
}

/**
 * Invalidates the in-process cache so the next request re-reads from the DB.
 * Call this after writing a new kill-switch document.
 */
export function invalidatePlatformStateCache() {
  lastLoadedAt = 0;
}

// ── Original guards ───────────────────────────────────────────────────────────

export function requireBookingsEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.bookingsPaused) {
      return res.status(503).json({ error: 'Bookings are temporarily paused' });
    }
    return next();
  };
}

export function requirePaymentsEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.paymentsPaused) {
      return res.status(503).json({ error: 'Payments are temporarily paused' });
    }
    return next();
  };
}

export function requireRegistrationsEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.registrationsPaused) {
      return res.status(503).json({ error: 'Registrations are temporarily paused' });
    }
    return next();
  };
}

// ── Extended feature guards ───────────────────────────────────────────────────

export function requireTrackingEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.trackingPaused) {
      return res.status(503).json({ error: 'GPS tracking is temporarily paused' });
    }
    return next();
  };
}

export function requireMatchingEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.matchingPaused) {
      return res.status(503).json({ error: 'Load matching is temporarily paused' });
    }
    return next();
  };
}

export function requireGstEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.gstPaused) {
      return res.status(503).json({ error: 'GST invoicing is temporarily paused' });
    }
    return next();
  };
}

export function requireTollsEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.tollsPaused) {
      return res.status(503).json({ error: 'Toll management is temporarily paused' });
    }
    return next();
  };
}

export function requireFleetEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.fleetPaused) {
      return res.status(503).json({ error: 'Fleet management is temporarily paused' });
    }
    return next();
  };
}

export function requireBrokersEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.brokersPaused) {
      return res.status(503).json({ error: 'Broker features are temporarily paused' });
    }
    return next();
  };
}

export function requireSupportEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    if (state.supportPaused) {
      return res.status(503).json({ error: 'Support submissions are temporarily paused' });
    }
    return next();
  };
}

/**
 * Standalone maintenance-mode guard.
 * Applied at the Express app level (index.js) to cover any endpoint that does
 * not already have one of the feature-specific guards above.
 *
 * Admin routes are exempt so the admin can turn maintenance mode back off.
 */
export function requireNotMaintenance() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is under maintenance. Please try again later.' });
    }
    return next();
  };
}
