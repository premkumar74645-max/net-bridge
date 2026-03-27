import { useState, useEffect } from 'react';

export type NetworkStatus = 'online' | 'offline';

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>(navigator.onLine ? 'online' : 'offline');

  useEffect(() => {
    const handleOnline = () => setStatus('online');
    const handleOffline = () => setStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}

export const networkManager = {
  isOnline: () => navigator.onLine,
  onStatusChange: (callback: (status: NetworkStatus) => void) => {
    window.addEventListener('online', () => callback('online'));
    window.addEventListener('offline', () => callback('offline'));
  }
};
