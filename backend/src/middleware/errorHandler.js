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

  // For 4xx we still surface the message because callers (forms, validators)
  // depend on it, but we only allow it through if the route handler set
  // `err.publicMessage` *or* the error originates from express-validator/joi
  // (`err.expose !== false`).  Library errors (mongoose, mongo driver) often
  // leak schema details in their messages, so default to a generic message.
  let clientMessage;
  if (err.publicMessage) {
    clientMessage = err.publicMessage;
  } else if (status >= 500) {
    clientMessage = 'Internal server error';
  } else if (err.expose === true) {
    clientMessage = err.message || 'Request failed';
  } else if (err.message && /^[\w .,'"!?/-]{0,200}$/.test(err.message)) {
    // Allowlist-style: only forward short, ASCII messages with no line breaks,
    // no `@` (emails), and no `:` (often appears in mongoose validation
    // messages like `Cast to ObjectId failed for value "x" at path "y"`).
    // This defeats common library messages that embed schema/PII info.
    clientMessage = err.message;
  } else {
    clientMessage = 'Request failed';
  }

  const body = {
    error: clientMessage,
    code: err.code || undefined,
    requestId,
  };

  return res.status(status).json(body);
}
