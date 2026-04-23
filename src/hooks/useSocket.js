import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getApiOrigin } from '../utils/api';

// Module-level singleton — a user only needs one open websocket even if
// many components subscribe to events.  Lazily created on first subscribe
// and closed when the last component unsubscribes.
let sharedSocket = null;
let subscriberCount = 0;

function ensureSocket() {
  if (sharedSocket) return sharedSocket;
  sharedSocket = io(getApiOrigin(), {
    path: '/socket.io',
    // Auth cookies (st_access) are sent automatically because withCredentials
    // triggers the cookie to ride along with the polling fallback handshake.
    // The backend socket middleware reads the cookie via getSocketAccessToken.
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  return sharedSocket;
}

function maybeCloseSocket() {
  if (subscriberCount <= 0 && sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
    subscriberCount = 0;
  }
}

/**
 * Subscribe to a socket.io event for the lifetime of the component.  The
 * handler is kept in a ref so consumers can pass inline arrow functions
 * without causing reconnect churn on every render.
 *
 * @example
 *   useSocket('notification', (n) => dispatch(addNotification(n)));
 */
export function useSocket(event, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!event) return undefined;
    const socket = ensureSocket();
    subscriberCount += 1;
    const listener = (...args) => {
      if (typeof handlerRef.current === 'function') {
        handlerRef.current(...args);
      }
    };
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
      subscriberCount -= 1;
      // Close only when there are truly zero listeners anywhere.
      if (subscriberCount <= 0) {
        // Defer close to the next tick so rapid remount sequences (e.g.
        // navigating between pages that both useSocket) don't thrash.
        setTimeout(maybeCloseSocket, 50);
      }
    };
  }, [event]);
}

/**
 * Return the shared socket, creating it if necessary.  Used by callers that
 * need to *emit* events (e.g. the driver's live-GPS page firing
 * `update-location` pings).  Prefer {@link useSocket} for subscribing to
 * incoming events.
 */
export function getSharedSocket() {
  return ensureSocket();
}

/**
 * Force-close the shared socket — call on logout so the next user doesn't
 * inherit the previous session's socket (which was authenticated via their
 * auth cookie).
 */
export function closeSharedSocket() {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
    subscriberCount = 0;
  }
}
