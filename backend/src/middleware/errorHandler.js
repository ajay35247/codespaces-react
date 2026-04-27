import crypto from 'crypto';

/**
 * Express error-handling middleware.  Must be registered AFTER all routes.
 *
 * - Adds a per-request correlation id (preserved from `x-request-id` if the
 *   caller provided one, otherwise generated) so log lines can be joined to
 *   the response the client received.
 * - Emits a structured log line on 5xx (still using console.error to avoid
 *   pulling in a pino dependency).
 * - Never leaks stack traces to clients in production.
 */
export function correlationIdMiddleware(req, res, next) {
  const incoming = String(req.headers['x-request-id'] || '').slice(0, 64);
  const id = incoming && /^[A-Za-z0-9._-]+$/.test(incoming)
    ? incoming
    : crypto.randomBytes(8).toString('hex');
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

export function globalErrorHandler(err, req, res, _next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  const requestId = req.requestId || '-';

  if (status >= 500) {
    // Structured one-liner — plays well with both grep and JSON-aware log
    // shippers.  We deliberately avoid leaking the stack to the client even
    // when NODE_ENV !== 'production' to keep the response shape consistent.
    const line = JSON.stringify({
      level: 'error',
      ts: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      status,
      message: err.message || 'Internal server error',
      stack: err.stack || '',
    });
    // eslint-disable-next-line no-console
    console.error(line);
  }

  const body = {
    error: err.publicMessage || (status >= 500 ? 'Internal server error' : (err.message || 'Request failed')),
    code: err.code || undefined,
    requestId,
  };

  return res.status(status).json(body);
}
