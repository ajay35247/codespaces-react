import { useEffect, useState } from 'react';
import { getNetworkState, subscribeNetwork, initNetworkGuard } from '../services/networkGuard';

/**
 * useNetworkStatus — returns `{ online: boolean }`.  The first caller boots
 * the network guard's heartbeat; further callers reuse the same singleton.
 */
export function useNetworkStatus() {
  const [state, setState] = useState(() => getNetworkState());
  useEffect(() => {
    initNetworkGuard();
    const unsub = subscribeNetwork(setState);
    return () => unsub();
  }, []);
  return state;
}
