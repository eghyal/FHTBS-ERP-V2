import { useState, useEffect, useRef } from "react";
import { get, set, del } from "idb-keyval";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/api";

export function useAutoSave<T>(key: string, initialData: T) {
  const [data, setData] = useState<T>(initialData);
  const [isLoaded, setIsLoaded] = useState(false);
  const { user } = useAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    setIsLoaded(false);
    setData(initialData);
    const userKey = `draft_v2_${user.username}_${key}`;

    // First try loading from server for cross-device sync
    apiFetch(`/api/user-drafts/${key}`, { method: "GET" }, user.username)
      .then((res) => {
        if (res.ok && res.data?.data) {
          setData(res.data.data);
          set(userKey, res.data.data).catch(console.error); // Update local cache
          setIsLoaded(true);
        } else {
          // Fallback to local
          return get(userKey).then((savedData) => {
            if (savedData !== undefined) {
              setData(savedData);
            } else {
              setData(initialData);
            }
            setIsLoaded(true);
          });
        }
      })
      .catch((err) => {
        console.error(
          "Failed to load draft from API, falling back to IDB",
          err,
        );
        return get(userKey).then((savedData) => {
          if (savedData !== undefined) {
            setData(savedData);
          } else {
            setData(initialData);
          }
          setIsLoaded(true);
        });
      });
  }, [key, user]);

  useEffect(() => {
    if (!isLoaded || !user) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Auto-save after a short delay
    timeoutRef.current = setTimeout(() => {
      const userKey = `draft_v2_${user.username}_${key}`;
      set(userKey, data).catch(console.error);

      // Sync to server in background
      apiFetch(
        `/api/user-drafts/${key}`,
        {
          method: "POST",
          body: JSON.stringify({ data }),
        },
        user.username,
      ).catch((e) => console.warn("Failed to sync draft to server", e));
    }, 2500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [data, isLoaded, key, user]);

  const clearDraft = async (resetData: boolean = true) => {
    if (resetData) setData(initialData);
    if (user) {
      const userKey = `draft_v2_${user.username}_${key}`;
      await del(userKey).catch(console.error);
      apiFetch(
        `/api/user-drafts/${key}`,
        { method: "DELETE" },
        user.username,
      ).catch(console.warn);
    }
  };

  return { data, setData, isLoaded, clearDraft };
}
