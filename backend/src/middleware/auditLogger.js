import AuditLog from '../schemas/AuditLogSchema.js';

/**
 * Express middleware that writes an audit log entry for every mutating request
 * (POST, PUT, PATCH, DELETE) after the response is sent.
 */
export function auditLogger(req, res, next) {
  const shouldLog = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!shouldLog) return next();

  const originalJson = res.json.bind(res);
  res.json = function (body) {
    res._auditBody = body;
    return originalJson(body);
  };

  res.on('finish', async () => {
    try {
      await AuditLog.create({
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        action: `${req.method} ${req.path}`,
        resource: req.path.split('/')[2] || req.path,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        metadata: req.body && Object.keys(req.body).length
          ? sanitizeBody(req.body)
          : undefined,
      });
    } catch {
      // Never let audit logging crash the app
    }
  });

  next();
}

function sanitizeBody(body) {
  const safe = { ...body };
  for (const field of ['password', 'token', 'refreshToken', 'key', 'secret']) {
    if (safe[field]) safe[field] = '[REDACTED]';
  }
  return safe;
}
