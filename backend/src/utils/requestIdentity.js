import crypto from 'crypto';

export function getRequestIp(req) {
  // Use Express's built-in trust-proxy-aware IP extraction so that
  // app.set('trust proxy', 1) is respected and clients cannot spoof
  // their IP via a forged X-Forwarded-For header.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function getDeviceId(req) {
  const headerDeviceId = req.get('x-device-id');
  if (headerDeviceId) {
    return String(headerDeviceId).slice(0, 128);
  }

  const ua = req.get('user-agent') || 'unknown';
  return crypto.createHash('sha256').update(ua).digest('hex').slice(0, 32);
}
