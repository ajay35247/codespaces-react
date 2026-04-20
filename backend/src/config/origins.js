function normalizeOrigin(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function parseCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

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
    return Array.from(new Set(explicitOrigins));
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
      'capacitor://localhost',
      'ionic://localhost',
    ];
  }

  // Fallback: never return empty in production — warn and use a safe default
  console.warn(
    'WARNING: No allowed origins configured. Set FRONTEND_URL or CLIENT_URL in environment variables.'
  );
  return [];
}

export function getAllowedOriginsSet() {
  return new Set(getAllowedOriginsFromEnv());
}

export function isAllowedOrigin(origin = '') {
  if (!origin) return false;
  return getAllowedOriginsSet().has(normalizeOrigin(origin));
}
