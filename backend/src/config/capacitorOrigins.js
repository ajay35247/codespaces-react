/**
 * Trusted first-party origins used by the Capacitor / native-WebView build of
 * the Speedy Trucks app.
 *
 * Android WebView does not reliably round-trip the non-HttpOnly `csrf-token`
 * cookie required by the double-submit CSRF check (mixed cookie partitioning
 * semantics across WebView versions). Authenticated requests from these
 * specific origins skip the strict double-submit check while still being
 * gated by HttpOnly cookie auth (`st_access`, SameSite=None+Secure) and the
 * trusted-origin defence-in-depth layer.
 *
 * Lowercased on purpose — `isCapacitorOrigin()` lowercases the incoming
 * Origin header before matching, since some WebView builds upcase the
 * scheme (`HTTPS://LOCALHOST`).
 *
 * Keep this list narrow. Adding any other origin re-opens cross-site CSRF.
 */
export const CAPACITOR_TRUSTED_ORIGINS = Object.freeze(new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
]));

/**
 * @param {string} origin Raw `Origin` header value, possibly with a trailing
 *   slash or mixed case. Empty string and falsy values are treated as a miss.
 * @returns {boolean} true iff `origin` matches a trusted Capacitor origin.
 */
export function isCapacitorOrigin(origin) {
  if (!origin) return false;
  const normalized = String(origin).replace(/\/$/, '').toLowerCase();
  return CAPACITOR_TRUSTED_ORIGINS.has(normalized);
}
