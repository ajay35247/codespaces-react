/**
 * Global error handler – must be registered AFTER all routes.
 * Normalises error shape and prevents leaking stack traces in production.
 */
export function globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;

  const body = {
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  };

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${status}`, err.message);
  }

  return res.status(status).json(body);
}
