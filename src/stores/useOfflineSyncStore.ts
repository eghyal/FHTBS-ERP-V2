import { create } from 'zustand';
import { get, set } from 'idb-keyval';
import { apiFetch } from '@/utils/api';

interface OfflineEvent {
  id: string;
  url: string;
  method: string;
  body: any;
  timestamp: number;
}

interface OfflineSyncState {
  isOffline: boolean;
  syncQueue: OfflineEvent[];
  isSyncing: boolean;
  setOfflineStatus: (status: boolean) => void;
  queueRequest: (url: string, method: string, body: any) => Promise<void>;
  syncPendingRequests: () => Promise<void>;
  loadQueue: () => Promise<void>;
}

export const useOfflineSyncStore = create<OfflineSyncState>((setStore, getStore) => ({
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  syncQueue: [],
  isSyncing: false,

  setOfflineStatus: (status) => {
    setStore({ isOffline: status });
    if (!status && getStore().syncQueue.length > 0) {
      getStore().syncPendingRequests();
    }
  },

  loadQueue: async () => {
    try {
      const queue = await get<OfflineEvent[]>('offline-sync-queue');
      if (queue) {
        setStore({ syncQueue: queue });
      }
    } catch (e) {
      console.error('Failed to load offline queue:', e);
    }
  },

  queueRequest: async (url, method, body) => {
    const newEvent: OfflineEvent = {
      id: crypto.randomUUID(),
      url,
      method,
      body,
      timestamp: Date.now()
    };
    
    const updatedQueue = [...getStore().syncQueue, newEvent];
    setStore({ syncQueue: updatedQueue });
    
    try {
      await set('offline-sync-queue', updatedQueue);
    } catch (e) {
      console.error('Failed to save offline queue:', e);
    }
  },

  syncPendingRequests: async () => {
    if (getStore().isSyncing || getStore().isOffline || getStore().syncQueue.length === 0) return;
    
    setStore({ isSyncing: true });
    const queue = [...getStore().syncQueue];
    const newQueue: OfflineEvent[] = [];
    
    for (const event of queue) {
      try {
        const res = await apiFetch(event.url, {
          method: event.method,
          body: JSON.stringify(event.body)
        });
        if (!res.ok) {
           newQueue.push(event);
        }
      } catch (err) {
        console.error('Failed to sync event', event.id, err);
        newQueue.push(event); // Re-queue on failure
      }
    }
    
    setStore({ syncQueue: newQueue, isSyncing: false });
    try {
      await set('offline-sync-queue', newQueue);
    } catch (e) {
      console.error('Failed to update offline queue after sync:', e);
    }
  }
}));
