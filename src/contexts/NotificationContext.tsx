import React, { useMemo, useCallback, useState,
  createContext,
  useContext,
  useEffect,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "../lib/localDb";

export type NotificationType = "CHAT" | "SUCCESS" | "ERROR" | "INFO";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date | string | number;
  isRead: boolean;
  link?: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  addNotification: (
    type: NotificationType,
    title: string,
    message: string,
    link?: string,
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [fallbackNotifications, setFallbackNotifications] = useState<NotificationItem[]>([]);

  // Use Dexie live query to reactively bind to IndexedDB safely
  const liveNotifications = useLiveQuery(
    async () => {
      try {
        if (!localDb?.notifications) return [];
        const records = await localDb.notifications
          .orderBy("timestamp")
          .reverse()
          .limit(50)
          .toArray();
        return records || [];
      } catch (err) {
        console.warn("IndexedDB live notifications query error:", err);
        return [];
      }
    },
    [],
    [],
  );

  const notifications = useMemo(() => {
    const rawList = (liveNotifications && liveNotifications.length > 0)
      ? liveNotifications
      : fallbackNotifications;

    return (rawList || []).map((n) => {
      let ts: Date;
      try {
        if (n.timestamp instanceof Date) {
          ts = isNaN(n.timestamp.getTime()) ? new Date() : n.timestamp;
        } else if (typeof n.timestamp === "number") {
          ts = new Date(n.timestamp > 1e11 ? n.timestamp : n.timestamp * 1000);
        } else if (typeof n.timestamp === "string") {
          const parsed = new Date(n.timestamp);
          ts = isNaN(parsed.getTime()) ? new Date() : parsed;
        } else if (n.timestamp && typeof (n.timestamp as any).toDate === "function") {
          ts = (n.timestamp as any).toDate();
        } else if (n.timestamp && typeof (n.timestamp as any).seconds === "number") {
          ts = new Date((n.timestamp as any).seconds * 1000);
        } else {
          ts = new Date();
        }
      } catch {
        ts = new Date();
      }

      return {
        id: String(n.id || Math.random().toString(36).substring(2, 9)),
        type: (n.type as NotificationType) || "INFO",
        title: typeof n.title === "string" ? n.title : String(n.title || "Notification"),
        message: typeof n.message === "string" ? n.message : String(n.message || ""),
        timestamp: ts,
        isRead: Boolean(n.isRead),
        link: n.link ? String(n.link) : undefined,
      };
    });
  }, [liveNotifications, fallbackNotifications]);

  const addNotification = useCallback(
    async (
      type: NotificationType,
      title: string,
      message: string,
      link?: string,
    ) => {
      const newNotif: NotificationItem = {
        id: Math.random().toString(36).substring(2, 11),
        type: type || "INFO",
        title: typeof title === "string" ? title : String(title || "Notification"),
        message: typeof message === "string" ? message : String(message || ""),
        timestamp: new Date(),
        isRead: false,
        link: link ? String(link) : undefined,
      };

      try {
        if (localDb?.notifications) {
          await localDb.notifications.add(newNotif as any);

          // Cleanup if more than 50
          const count = await localDb.notifications.count();
          if (count > 50) {
            const oldest = await localDb.notifications.orderBy("timestamp").first();
            if (oldest) await localDb.notifications.delete(oldest.id);
          }
        }
      } catch (err) {
        console.warn("Failed to add notification to IndexedDB, fallback in-memory:", err);
      }

      setFallbackNotifications((prev) => [newNotif, ...prev.slice(0, 49)]);
    },
    [],
  );

  const markAsRead = useCallback(async (id: string) => {
    try {
      if (localDb?.notifications) {
        await localDb.notifications.update(id, { isRead: true });
      }
    } catch (err) {
      console.warn("Failed to mark notification as read in IndexedDB:", err);
    }
    setFallbackNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      if (localDb?.notifications) {
        await localDb.notifications.toCollection().modify({ isRead: true });
      }
    } catch (err) {
      console.warn("Failed to mark all as read in IndexedDB:", err);
    }
    setFallbackNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true }))
    );
  }, []);

  const clearAll = useCallback(async () => {
    try {
      if (localDb?.notifications) {
        await localDb.notifications.clear();
      }
    } catch (err) {
      console.warn("Failed to clear notifications in IndexedDB:", err);
    }
    setFallbackNotifications([]);
  }, []);

  const unreadCount = useMemo(() => {
    return (notifications || []).filter((n) => !n.isRead).length;
  }, [notifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications: notifications || [],
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
}
