function normalizeOrigin(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function parseCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

// Pseudo-origins used by Capacitor / Ionic WebViews when the same React bundle
// runs inside the Android (and iOS) APK.  These are non-routable local
// schemes — they cannot be reached by a third-party site — so allowing them
// in every environment is safe and is required for the APK to talk to the
// same backend as the web app (see docs/MOBILE-BUILD.md).
const CAPACITOR_WEBVIEW_ORIGINS = [
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

export function getAllowedOriginsFromEnv() {
  const explicitOrigins = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    process.env.ADDITIONAL_ALLOWED_ORIGIN,
    ...parseCsv(process.env.ALLOWED_ORIGINS),
  ]
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  if (explicitOrigins.length > 0) {
    return Array.from(new Set([...explicitOrigins, ...CAPACITOR_WEBVIEW_ORIGINS]));
  }

  // Always return localhost origins in development
  if (process.env.NODE_ENV !== 'production') {
    return [
      'http://localhost:3000',
      'http://localhost:4173',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:4173',
      'http://127.0.0.1:5173',
      ...CAPACITOR_WEBVIEW_ORIGINS,
    ];
  }

  // Fallback: never return empty in production — warn and use a safe default
  console.warn(
    'WARNING: No allowed origins configured. Set FRONTEND_URL or CLIENT_URL in environment variables.'
  );
  return [...CAPACITOR_WEBVIEW_ORIGINS];
}

export function getAllowedOriginsSet() {
  return new Set(getAllowedOriginsFromEnv());
}

export function isAllowedOrigin(origin = '') {
  if (!origin) return false;
  return getAllowedOriginsSet().has(normalizeOrigin(origin));
}
