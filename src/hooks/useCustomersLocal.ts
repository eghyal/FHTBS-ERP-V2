import { useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, Customer } from "../lib/localDb";
import { apiFetch } from "../utils/api";
import { useSyncEngine } from "./useSyncEngine";

export function useCustomersLocal(user: any) {
  const { isOnline, triggerSync } = useSyncEngine();

  // Reactive binding to local IndexedDB
  const localCustomers = useLiveQuery(
    () => localDb.customers.orderBy("lastModified").reverse().toArray(),
    [],
  );

  const fetchFromCloud = useCallback(async () => {
    if (!isOnline || !user) return;
    try {
      const res = await apiFetch("/api/sales/customers", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        const cloudIds = new Set(res.data.map((c: any) => c.id));
        const allLocal = await localDb.customers.toArray();
        const idsToDelete = allLocal
          .filter(
            (c) =>
              c.syncStatus !== "draft" &&
              c.syncStatus !== "modified" &&
              !cloudIds.has(c.id),
          )
          .map((c) => c.id);
        if (idsToDelete.length > 0) {
          await localDb.customers.bulkDelete(idsToDelete);
        }

        if (res.data.length > 0) {
          const toUpsert = res.data.map((c: any) => ({
            ...c,
            syncStatus: "synced",
            lastModified: new Date().getTime(),
          }));
          await localDb.customers.bulkPut(toUpsert);
        }
      }
    } catch (err) {
      console.error("Failed to fetch from cloud", err);
    }
  }, [isOnline, user]);

  // Initial cloud fetch when coming online
  useEffect(() => {
    if (isOnline) {
      fetchFromCloud();
    }
  }, [isOnline, fetchFromCloud]);

  const addCustomerLocal = async (customerData: Partial<Customer>) => {
    const tempId = "draft_" + Math.random().toString(36).substring(2, 11);
    const newCustomer = {
      ...customerData,
      id: tempId,
      syncStatus: "draft" as const,
      lastModified: new Date().getTime(),
    } as Customer;

    // 1. Save to local DB instantly
    await localDb.customers.add(newCustomer);

    // 2. Queue offline action
    await localDb.offlineActions.add({
      entity: "customers",
      action: "CREATE",
      payload: newCustomer,
      timestamp: new Date().getTime(),
      status: "pending",
    });

    // 3. Trigger sync in background if online
    if (isOnline) triggerSync();
  };

  const updateCustomerLocal = async (
    id: string,
    customerData: Partial<Customer>,
  ) => {
    const updated = {
      ...customerData,
      syncStatus: "modified" as const,
      lastModified: new Date().getTime(),
    };

    // 1. Update local DB instantly
    await localDb.customers.update(id, updated);

    // 2. Queue offline action
    await localDb.offlineActions.add({
      entity: "customers",
      action: "UPDATE",
      payload: { id, ...customerData },
      timestamp: new Date().getTime(),
      status: "pending",
    });

    // 3. Trigger sync
    if (isOnline) triggerSync();
  };

  const deleteCustomerLocal = async (id: string) => {
    // 1. Delete from local DB instantly
    await localDb.customers.delete(id);

    // 2. Queue offline action
    await localDb.offlineActions.add({
      entity: "customers",
      action: "DELETE",
      payload: { id },
      timestamp: new Date().getTime(),
      status: "pending",
    });

    // 3. Trigger sync
    if (isOnline) triggerSync();
  };

  return {
    customers: localCustomers || [],
    isLoading: localCustomers === undefined,
    addCustomerLocal,
    updateCustomerLocal,
    deleteCustomerLocal,
    refreshCloud: fetchFromCloud,
  };
}
