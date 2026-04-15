import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem('speedy-trucks-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token ?? null;
  } catch {
    return null;
  }
}

export const useSocket = (userId?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const token = getAuthToken();
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
      auth: { token },
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      setIsConnected(false);

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        newSocket.connect();
      }, 5000);
    });

    setSocket(newSocket);

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      newSocket.disconnect();
    };
  }, []);  // token is read once on mount; reconnect triggers re-auth via auth.token

  const emit = (event: string, data?: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    if (socket) {
      socket.on(event, callback);

      return () => {
        socket.off(event, callback);
      };
    }
  };

  const off = (event: string, callback?: (...args: any[]) => void) => {
    if (socket) {
      if (callback) {
        socket.off(event, callback);
      } else {
        socket.off(event);
      }
    }
  };

  return {
    socket,
    isConnected,
    emit,
    on,
    off,
  };
};