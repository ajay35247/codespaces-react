/**
 * useSubscription — read the caller's subscription + today's daily-quota
 * usage from /payments/me/subscription.
 *
 * Returns `{ subscription, usage, loading, error, refresh }`.
 *
 * Pages can render a "3/10 loads today" usage bar by combining
 * `usage.loadsCreated` with `usage.loadsLimit` (-1 = unlimited).
 *
 * The hook does not poll — call `refresh()` after any action that might
 * change usage (e.g. after creating a load or placing a bid).
 */
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

export function useSubscription() {
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/payments/me/subscription');
      setSubscription(data?.subscription || null);
      setUsage(data?.usage || null);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh().catch(() => { /* refresh already captures error in state */ });
    return () => { cancelled = true; };
    // refresh is stable (useCallback with [] deps).
  }, [refresh]);

  return { subscription, usage, loading, error, refresh };
}

export default useSubscription;
