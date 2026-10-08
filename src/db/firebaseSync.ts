import { firestore, isFirebaseConfigured } from "../lib/firebase.ts";
import { doc, setDoc, deleteDoc, getDocs, collection, query, limit, writeBatch } from "firebase/firestore";
import db from "./database.ts";
import { hybridDb } from "./firestoreAdapter.ts";
import { replicateToPostgres, deleteFromPostgres } from "./postgresBridge.ts";

export const cloudFirestore = firestore;

// Non-blocking background sync queue with metrics
const syncQueue: Array<{ collectionName: string; id: string; data?: any; type: "SET" | "DELETE" }> = [];
let isProcessingQueue = false;
let totalSyncedItems = 0;

async function processQueue() {
  if (isProcessingQueue || syncQueue.length === 0) return;
  isProcessingQueue = true;

  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    while (syncQueue.length > 0) {
      // Deduplicate the entire remaining queue to prevent redundant writes
      const dedupedMap = new Map<string, any>();
      while (syncQueue.length > 0) {
        const item = syncQueue.shift();
        if (item) dedupedMap.set(`${item.collectionName}|${item.id}`, item);
      }
      const dedupedItems = Array.from(dedupedMap.values());

      for (let i = 0; i < dedupedItems.length; i += 450) {
        const chunk = dedupedItems.slice(i, i + 450);
        const batch = writeBatch(firestore);
        let batchHasOperations = false;

        for (const item of chunk) {
          try {
            if (item.type === "SET") {
              if (hybridDb.getMode() === "DUAL" || hybridDb.getMode() === "SQLITE_FALLBACK") {
                try { (hybridDb as any).writeToSqlite(item.collectionName, item.id, item.data || {}); } catch(e) {}
              }
              if (hybridDb.getMode() === "DUAL" || hybridDb.getMode() === "FIRESTORE_ONLY") {
                const docRef = doc(firestore, item.collectionName, String(item.id));
                const cleanData = (hybridDb as any).sanitizeForFirestore(item.data || {});
                cleanData._updatedAt = new Date().toISOString();
                batch.set(docRef, cleanData, { merge: true });
                batchHasOperations = true;
              }
              totalSyncedItems++;
            } else if (item.type === "DELETE") {
              if (hybridDb.getMode() === "DUAL" || hybridDb.getMode() === "SQLITE_FALLBACK") {
                try { (hybridDb as any).deleteFromSqlite(item.collectionName, item.id); } catch(e) {}
              }
              if (hybridDb.getMode() === "DUAL" || hybridDb.getMode() === "FIRESTORE_ONLY") {
                const docRef = doc(firestore, item.collectionName, String(item.id));
                batch.delete(docRef);
                batchHasOperations = true;
              }
              totalSyncedItems++;
            }
          } catch (err: any) {
            console.warn(`[Firestore Queue] Error preparing ${item.collectionName}/${item.id}:`, err?.message || err);
          }
        }

        if (batchHasOperations) {
          try {
            await batch.commit();
            (hybridDb as any).syncCount += chunk.length;
            (hybridDb as any).lastSyncTimestamp = new Date().toISOString();
            // Add a small delay between batches to respect Firestore write stream limits
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (err: any) {
            console.error(`[Firestore Queue] Batch commit failed:`, err?.message || err);
          }
        }
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

let syncTimer: any = null;

function triggerDebouncedSync() {
  if (!syncTimer) {
    syncTimer = setTimeout(() => {
      processQueue().catch(console.error).finally(() => { syncTimer = null; });
    }, 5000); // Wait 5 seconds before pushing to Firebase to batch multiple rapid changes (Saves Write Quotas)
  }
}

export function syncCollectionToFirestore(
  collectionName: string,
  docId: string,
  data: Record<string, any>
) {
  if (!isFirebaseConfigured) {
    // Cloud sync disabled (no Firebase credentials); keep Postgres replication only.
    try {
      replicateToPostgres(collectionName, String(docId), data);
    } catch (e) {
      // Non-blocking
    }
    return;
  }
  syncQueue.push({ collectionName, id: String(docId), data, type: "SET" });
  triggerDebouncedSync();
  try {
    replicateToPostgres(collectionName, String(docId), data);
  } catch (e) {
    // Non-blocking
  }
}

export function deleteDocFromFirestore(collectionName: string, docId: string) {
  if (!isFirebaseConfigured) {
    try {
      deleteFromPostgres(collectionName, String(docId));
    } catch (e) {
      // Non-blocking
    }
    return;
  }
  syncQueue.push({ collectionName, id: String(docId), type: "DELETE" });
  triggerDebouncedSync();
  try {
    deleteFromPostgres(collectionName, String(docId));
  } catch (e) {
    // Non-blocking
  }
}

export function getSyncQueueStats() {
  return {
    queueLength: syncQueue.length,
    isProcessing: isProcessingQueue,
    totalSyncedItems,
    adapterStats: hybridDb.getStats()
  };
}

// Auto-Rehydration Engine: Restores cloud data into local relational engine on server startup
export async function rehydrateLocalFromCloudFirestore() {
  console.log("[Firestore Rehydration] Checking cloud state for startup synchronization...");
  try {
    const tablesToHydrate = [
      { coll: "projects", table: "projects", idCol: "id" },
      { coll: "project_stations", table: "project_stations", idCol: "id" },
      { coll: "bop_steps", table: "bill_of_processes", idCol: "id" },
      { coll: "bill_of_processes", table: "bill_of_processes", idCol: "id" },
      { coll: "work_order_tickets", table: "work_order_tickets", idCol: "id" },
      { coll: "ndp_issues", table: "notice_to_down_processes", idCol: "id" },
      { coll: "notice_to_down_processes", table: "notice_to_down_processes", idCol: "id" },
      { coll: "project_lots", table: "production_lots", idCol: "id" },
      { coll: "production_lots", table: "production_lots", idCol: "id" },
      { coll: "lot_executions", table: "lot_routing_executions", idCol: "id" },
      { coll: "lot_routing_executions", table: "lot_routing_executions", idCol: "id" },
      { coll: "production_manpower", table: "production_manpower", idCol: "id" },
      { coll: "items", table: "items", idCol: "id" },
      { coll: "users", table: "users", idCol: "id" }
    ];

    for (const item of tablesToHydrate) {
      try {
        const q = query(collection(firestore, item.coll), limit(50));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          console.log(`[Firestore Rehydration] Rehydrating ${snapshot.size} records from ${item.coll}...`);
          const checkTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(item.table);
          if (!checkTable) continue;

          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            delete data._syncedAt;
            delete data._updatedAt;
            const keys = Object.keys(data);
            if (keys.length === 0) continue;

            const existing = db.prepare(`SELECT ${item.idCol} FROM "${item.table}" WHERE ${item.idCol} = ?`).get(docSnap.id);
            if (!existing) {
              const placeholders = keys.map(() => "?").join(",");
              const columns = keys.map(k => `"${k}"`).join(",");
              const values = keys.map(k => typeof data[k] === "object" && data[k] !== null ? JSON.stringify(data[k]) : data[k]);
              try {
                db.prepare(`INSERT OR REPLACE INTO "${item.table}" (${columns}) VALUES (${placeholders})`).run(...values);
              } catch (insertErr) {
                // Ignore missing columns or type mismatches
              }
            }
          }
        }
      } catch (collErr: any) {
        console.warn(`[Firestore Rehydration] Notice on collection ${item.coll}:`, collErr?.message);
      }
    }
    console.log("[Firestore Rehydration] Startup synchronization completed successfully.");
  } catch (err: any) {
    console.warn("[Firestore Rehydration] Skip on startup:", err?.message || err);
  }
}

// Hard wipe all collections for factory reset
export async function clearAllCloudData() {
  console.log("[Firestore Reset] Wiping all cloud collections...");
  const collectionsToClear = [
    "projects", "bop_steps", "bill_of_processes", "ndp_issues", "notice_to_down_processes",
    "project_lots", "production_lots", "lot_executions", "lot_routing_executions",
    "production_manpower", "items", "users", "finance_transactions",
    "project_stations", "chat_messages", "forum_posts", "task_travel_tags", 
    "production_manpower_assignments", "stock_movements"
  ];

  for (const coll of collectionsToClear) {
    try {
      let hasMore = true;
      let totalDeleted = 0;
      while (hasMore) {
        const q = query(collection(firestore, coll), limit(50));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          hasMore = false;
          break;
        }
        const promises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(promises);
        totalDeleted += snapshot.size;
      }
      if (totalDeleted > 0) {
         console.log(`[Firestore Reset] Cleared ${totalDeleted} documents from ${coll}`);
      }
    } catch (e) {
      console.error(`[Firestore Reset] Failed to clear ${coll}:`, e);
    }
  }
}

export async function clearHrCloudData() {
  console.log("[Firestore Reset] Wiping HR cloud collections...");
  const hrCollections = [
    "attendance_db.hr_attendances", "hr_jobs", "hr_applications", 
    "hr_kpis", "finance_payroll", "payroll_requisitions", 
    "hr_handovers", "hr_leaves", "hr_payslips", "hr_salaries", 
    "cms_settings"
  ];

  for (const coll of hrCollections) {
    try {
      let hasMore = true;
      let totalDeleted = 0;
      while (hasMore) {
        const q = query(collection(firestore, coll), limit(50));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          hasMore = false;
          break;
        }
        const promises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(promises);
        totalDeleted += snapshot.size;
      }
      if (totalDeleted > 0) { 
        console.log(`[Firestore Reset] Cleared ${totalDeleted} documents from ${coll}`);
      }
    } catch (e) {
      console.error(`[Firestore Reset] Failed to clear ${coll}:`, e);
    }
  }
}
