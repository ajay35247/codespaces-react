import AdminControlState from '../schemas/AdminControlStateSchema.js';

let cachedState = {
  bookingsPaused: false,
  paymentsPaused: false,
  registrationsPaused: false,
};
let lastLoadedAt = 0;

async function getKillSwitchState() {
  const now = Date.now();
  if (now - lastLoadedAt < 3000) {
    return cachedState;
  }

  const item = await AdminControlState.findOne({ key: 'kill-switch' }).lean();
  cachedState = item?.value || cachedState;
  lastLoadedAt = now;
  return cachedState;
}

export function requireBookingsEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.bookingsPaused) {
      return res.status(503).json({ error: 'Bookings are temporarily paused' });
    }
    return next();
  };
}

export function requirePaymentsEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.paymentsPaused) {
      return res.status(503).json({ error: 'Payments are temporarily paused' });
    }
    return next();
  };
}

export function requireRegistrationsEnabled() {
  return async (req, res, next) => {
    const state = await getKillSwitchState();
    if (state.registrationsPaused) {
      return res.status(503).json({ error: 'Registrations are temporarily paused' });
    }
    return next();
  };
}
