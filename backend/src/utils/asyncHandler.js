/**
 * Tiny wrapper that forwards async route handler errors to Express's
 * `next(err)` so they reach `globalErrorHandler` instead of producing an
 * unhandled promise rejection.
 *
 * Usage:
 *   router.get('/things', asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
