import crypto from 'crypto';
import { getRequestIp } from '../utils/requestIdentity.js';

const ADMIN_PATH_SEGMENT = process.env.ADMIN_PRIVATE_PATH_SEGMENT || '_ops_console_f91b7c';
const IP_WHITELIST = (process.env.ADMIN_IP_WHITELIST || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const ADMIN_PATH_HASH = crypto.createHash('sha256').update(ADMIN_PATH_SEGMENT).digest('hex');

export function getAdminPathSegment() {
  return ADMIN_PATH_SEGMENT;
}

export function getAdminPathHash() {
  return ADMIN_PATH_HASH;
}

export function requireAdminIpWhitelist(req, res, next) {
  if (IP_WHITELIST.length === 0) {
    return next();
  }

  const requestIp = getRequestIp(req);
  if (!IP_WHITELIST.includes(requestIp)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  return next();
}
