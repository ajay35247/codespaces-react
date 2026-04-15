import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

export const useSocket = (userId?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);

      if (userId) {
        newSocket.emit('join', userId);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);

      // Retry connection after delay
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        newSocket.connect();
      }, 5000);
    });

    setSocket(newSocket);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      newSocket.disconnect();
    };
  }, [userId]);

  // Join room when userId changes
  useEffect(() => {
    if (socket && userId && isConnected) {
      socket.emit('join', userId);
    }
  }, [socket, userId, isConnected]);

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