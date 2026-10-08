import Dexie, { type Table } from "dexie";
import type { NotificationItem } from "../contexts/NotificationContext";

export interface OfflineAction {
  id?: number;
  entity: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  payload: any;
  timestamp: number;
  status: "pending" | "synced" | "failed";
  error?: string;
}

export interface Customer {
  id: string;
  name: string;
  code: string;
  contact_person?: string;
  email: string;
  phone: string;
  address: string;
  npwp?: string;
  delivered_count?: number;
  pending_count?: number;
  total_deliveries?: number;
  syncStatus?: "synced" | "draft" | "modified";
  lastModified: number;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  location?: string;
  syncStatus?: "synced" | "draft" | "modified";
  lastModified: number;
}

export interface SyncMetadata {
  key: string;
  lastSync: number;
}

export class ERPlocalDB extends Dexie {
  notifications!: Table<NotificationItem, string>;
  offlineActions!: Table<OfflineAction, number>;
  customers!: Table<Customer, string>;
  inventory!: Table<InventoryItem, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super("ERP_LocalFirstDB");
    this.version(2).stores({
      notifications: "id, type, timestamp, isRead",
      offlineActions: "++id, entity, action, status, timestamp",
      customers: "id, name, syncStatus, lastModified",
      inventory: "id, sku, name, syncStatus, lastModified",
      syncMetadata: "key, lastSync",
    });
  }
}

export const localDb = new ERPlocalDB();
