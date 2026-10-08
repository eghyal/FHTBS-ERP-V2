import { useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, InventoryItem } from "../lib/localDb";
import { apiFetch } from "../utils/api";
import { useSyncEngine } from "./useSyncEngine";

export function useInventoryLocal(user: any) {
  const { isOnline, triggerSync } = useSyncEngine();

  // Reactive binding to local IndexedDB
  const localInventory = useLiveQuery(
    () => localDb.inventory.orderBy("lastModified").reverse().toArray(),
    [],
  );

  const fetchFromCloud = useCallback(async () => {
    if (!isOnline || !user) return;
    try {
      const res = await apiFetch("/api/inventory", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        const cloudItemIds = new Set(res.data.map((item: any) => item.id));
        const allLocal = await localDb.inventory.toArray();
        const idsToDelete = allLocal
          .filter(
            (item) =>
              item.syncStatus !== "draft" &&
              item.syncStatus !== "modified" &&
              !cloudItemIds.has(item.id),
          )
          .map((item) => item.id);
        if (idsToDelete.length > 0) {
          await localDb.inventory.bulkDelete(idsToDelete);
        }

        if (res.data.length > 0) {
          const toUpsert = res.data.map((item: any) => ({
            ...item,
            syncStatus: "synced",
            lastModified: new Date().getTime(),
          }));
          await localDb.inventory.bulkPut(toUpsert);
        }
      }
    } catch (err) {
      console.error("Failed to fetch inventory from cloud", err);
    }
  }, [isOnline, user]);

  // Initial cloud fetch when coming online
  useEffect(() => {
    if (isOnline) {
      fetchFromCloud();
    }
  }, [isOnline, fetchFromCloud]);

  const addInventoryLocal = async (itemData: Partial<InventoryItem>) => {
    const tempId = "draft_" + Math.random().toString(36).substring(2, 11);
    const newItem = {
      ...itemData,
      id: tempId,
      free_stock: itemData.quantity || 0,
      allocated_stock: 0,
      syncStatus: "draft" as const,
      lastModified: new Date().getTime(),
    } as any; // Type override for the simplified model vs real app

    // 1. Save to local DB instantly
    await localDb.inventory.add(newItem);

    // 2. Queue offline action
    await localDb.offlineActions.add({
      entity: "inventory",
      action: "CREATE",
      payload: newItem,
      timestamp: new Date().getTime(),
      status: "pending",
    });

    // 3. Trigger sync in background if online
    if (isOnline) triggerSync();
  };

  const adjustStockLocal = async (
    id: string,
    qtyDiff: number,
    reason: string,
  ) => {
    const item = await localDb.inventory.get(id);
    if (!item) return;

    // Adjust in real data, inventory item structure is wider in app than in localDb interface
    const currentQty = (item as any).free_stock || item.quantity || 0;
    const newQty = currentQty + qtyDiff;

    const updated = {
      ...item,
      free_stock: newQty,
      quantity: newQty, // Keep synced with local DB schema
      syncStatus: "modified" as const,
      lastModified: new Date().getTime(),
    };

    // 1. Update local DB instantly
    await localDb.inventory.update(id, updated);

    // 2. Queue offline action (API payload style)
    await localDb.offlineActions.add({
      entity: "inventory",
      action: "UPDATE", // Or custom ADJUST action
      payload: {
        id,
        quantity_diff: qtyDiff,
        reason,
      },
      timestamp: new Date().getTime(),
      status: "pending",
    });

    // 3. Trigger sync
    if (isOnline) triggerSync();
  };

  return {
    inventory: localInventory || [],
    isLoading: localInventory === undefined,
    addInventoryLocal,
    adjustStockLocal,
    refreshCloud: fetchFromCloud,
  };
}
