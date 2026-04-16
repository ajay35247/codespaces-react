import crypto from 'crypto';

export function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip;
}

export function getDeviceId(req) {
  const headerDeviceId = req.get('x-device-id');
  if (headerDeviceId) {
    return String(headerDeviceId).slice(0, 128);
  }

  const ua = req.get('user-agent') || 'unknown';
  return crypto.createHash('sha256').update(ua).digest('hex').slice(0, 32);
}
